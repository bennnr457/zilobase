import { Hono } from "hono";
import { hasAccess } from "../../../services/access/access-level";
import {
  canAccessPageInWorkspace,
  getEffectiveTeamspaceAccessInWorkspace,
} from "../../../services/access/effective-access";
import { getMembership } from "../../../services/access/principal-access";
import {
  convertPageToTeamspace,
  createHierarchicalPage,
  embedPageItem,
  movePageToTeamspace,
  unembedPageItem,
} from "../../../services/pages/hierarchy/page-hierarchy";
import type { AppBindings } from "../../../shared/contracts/http";
import { rejectMismatchedPinnedWorkspace } from "../../auth/oauth/oauth-access";
import { readAuthenticatedJson, getAuthenticatedUser as requireUser } from "../../http/auth";
import { readJsonBody } from "../../http/request";
import { attachServiceErrorHandler } from "../../http/route-error";

import { getPageRecord as getPage } from "../../../services/access/resource-access-records";
import { TeamspaceManagementService } from "../../../services/teamspaces/management";
import { rejectActiveWorkspaceMismatch as enforceActiveWorkspace } from "../../access/workspace-mismatch";

export const pageHierarchyRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

pageHierarchyRoutes.post("/", async (c) => {
  const request = await readAuthenticatedJson(c);
  if (!request.ok) return request.response;
  const { user, body } = request;

  const {
    workspaceId,
    type = "pageblock",
    name = "",
    url = "#",
    content = null,
    metadata = null,
    parentItemId = null,
    teamspaceId = null,
  } = body as {
    workspaceId?: unknown;
    type?: unknown;
    name?: unknown;
    url?: unknown;
    content?: unknown;
    metadata?: unknown;
    parentItemId?: unknown;
    teamspaceId?: unknown;
  };

  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  const mismatch = rejectMismatchedPinnedWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  if (typeof name !== "string") {
    return c.json({ error: "name must be a string" }, 400);
  }

  if (typeof type !== "string" || typeof url !== "string") {
    return c.json({ error: "type and url must be strings" }, 400);
  }

  if (parentItemId === null && !(await getMembership(workspaceId, user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const createOrgMismatch = await enforceActiveWorkspace(c, workspaceId, user.id);

  if (createOrgMismatch) {
    return createOrgMismatch;
  }

  if (parentItemId !== null && typeof parentItemId !== "string") {
    return c.json({ error: "parentItemId must be a string or null" }, 400);
  }

  if (teamspaceId !== null && typeof teamspaceId !== "string") {
    return c.json({ error: "teamspaceId must be a string or null" }, 400);
  }

  if (
    typeof parentItemId === "string" &&
    !(await canAccessPageInWorkspace(parentItemId, workspaceId, user.id, "edit"))
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return c.json(
    await createHierarchicalPage(
      { workspaceId, type, name, url, content, metadata, parentItemId, teamspaceId },
      user,
    ),
    201,
  );
});

pageHierarchyRoutes.post("/:id/move-teamspace", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await readJsonBody(c.req);
  const destinationId =
    body && typeof body === "object" ? (body as { teamspaceId?: unknown }).teamspaceId : undefined;
  if (destinationId !== null && typeof destinationId !== "string") {
    return c.json({ error: "teamspaceId must be a string or null" }, 400);
  }

  const record = await getPage(c.req.param("id"));
  if (!record) return c.json({ error: "Page not found" }, 404);
  if (!(await canAccessPageInWorkspace(record.id, record.workspaceId, user.id, "full"))) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (
    destinationId &&
    !hasAccess(
      await getEffectiveTeamspaceAccessInWorkspace(destinationId, record.workspaceId, user.id),
      "edit",
    )
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (!destinationId && !(await getMembership(record.workspaceId, user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return c.json(await movePageToTeamspace(record, destinationId));
});

pageHierarchyRoutes.post("/:id/convert-to-teamspace", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const record = await getPage(c.req.param("id"));
  if (!record) return c.json({ error: "Page not found" }, 404);
  if (record.teamspaceId) {
    return c.json({ error: "This page is already in a teamspace." }, 409);
  }
  if (!(await canAccessPageInWorkspace(record.id, record.workspaceId, user.id, "full"))) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const body = await readJsonBody(c.req, {});
  const accessMode =
    body &&
    typeof body === "object" &&
    ["open", "closed", "private"].includes(String((body as { accessMode?: unknown }).accessMode))
      ? (body as { accessMode: "open" | "closed" | "private" }).accessMode
      : "closed";
  const requestedName =
    body && typeof body === "object" && typeof (body as { name?: unknown }).name === "string"
      ? (body as { name: string }).name.trim()
      : "";
  const service = new TeamspaceManagementService(
    undefined,
    c.get("editionExtension") ?? undefined,
    c.env,
  );
  try {
    return c.json(
      await convertPageToTeamspace(service, record, user, accessMode, requestedName),
      201,
    );
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return c.json({ error: error.message }, (error as { status: 400 | 403 | 404 | 409 }).status);
    }
    throw error;
  }
});

pageHierarchyRoutes.post("/:id/embed-item", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const hostId = c.req.param("id");
  const body = await readJsonBody(c.req);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const { itemId, kind } = body as {
    itemId?: unknown;
    kind?: unknown;
  };

  if (typeof itemId !== "string" || itemId.length === 0) {
    return c.json({ error: "itemId is required" }, 400);
  }

  if (kind !== "page" && kind !== "database") {
    return c.json({ error: "kind must be page or database" }, 400);
  }

  const host = await getPage(hostId);

  if (!host) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(host.id, host.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const embedOrgMismatch = await enforceActiveWorkspace(c, host.workspaceId, user.id);

  if (embedOrgMismatch) {
    return embedOrgMismatch;
  }

  return c.json(await embedPageItem(host, user, itemId, kind));
});

pageHierarchyRoutes.delete("/:id/embed-item", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const hostId = c.req.param("id");
  const body = await readJsonBody(c.req);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const { itemId, kind, placementId } = body as {
    itemId?: unknown;
    kind?: unknown;
    placementId?: unknown;
  };

  if (typeof itemId !== "string" || itemId.length === 0) {
    return c.json({ error: "itemId is required" }, 400);
  }

  if (kind !== "page" && kind !== "database") {
    return c.json({ error: "kind must be page or database" }, 400);
  }

  const host = await getPage(hostId);

  if (!host) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(host.id, host.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const unembedOrgMismatch = await enforceActiveWorkspace(c, host.workspaceId, user.id);

  if (unembedOrgMismatch) {
    return unembedOrgMismatch;
  }

  return c.json(await unembedPageItem(host, itemId, kind, placementId));
});
