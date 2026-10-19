import { Hono } from "hono";
import { hasAccess, type AccessLevel } from "../../../services/access/access-level";
import {
  getEffectivePageAccessInWorkspace,
  isPagePublishedInWorkspace,
} from "../../../services/access/effective-access";
import { getMembership } from "../../../services/access/principal-access";
import { getPageRecord as getPage } from "../../../services/access/resource-access-records";
import { getPageDetail } from "../../../services/pages/read/page-detail";
import { listWorkspacePages } from "../../../services/pages/read/page-list";
import { getPageIncludingDeleted } from "../../../services/pages/read/page-records";
import type { AppBindings } from "../../../shared/contracts/http";
import { rejectActiveWorkspaceMismatch as enforceActiveWorkspace } from "../../access/workspace-mismatch";
import { rejectMismatchedPinnedWorkspace } from "../../auth/oauth/oauth-access";
import { getAuthenticatedUser as requireUser } from "../../http/auth";
import { attachServiceErrorHandler } from "../../http/route-error";

export const pageBrowseRoutes = attachServiceErrorHandler(new Hono<AppBindings>());
export const pageBrowseDetailRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

pageBrowseRoutes.get("/", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceId = c.req.query("workspaceId");

  if (!workspaceId) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  const mismatch = rejectMismatchedPinnedWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  return c.json(await listWorkspacePages(workspaceId, user.id, c.req.query("deleted") === "only"));
});

pageBrowseDetailRoutes.get("/:id", async (c) => {
  const user = requireUser(c);

  const record = await getPageIncludingDeleted(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Page not found" }, 404);
  }

  let accessLevel: AccessLevel = "none";
  let usesPublishedFallback = false;

  if (record.deletedAt && user) {
    accessLevel = (await getMembership(record.workspaceId, user.id)) ? "full" : "none";
  } else if (user) {
    accessLevel = await getEffectivePageAccessInWorkspace(record.id, record.workspaceId, user.id);
  }

  if (!hasAccess(accessLevel, "view")) {
    const published = await isPagePublishedInWorkspace(record.id, record.workspaceId);

    if (!published) {
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      return c.json({ error: "Forbidden" }, 403);
    }

    usesPublishedFallback = true;
  }

  if (user && hasAccess(accessLevel, "view")) {
    const pageOrgMismatch = await enforceActiveWorkspace(c, record.workspaceId, user.id);

    if (pageOrgMismatch) {
      return pageOrgMismatch;
    }
  }

  return c.json(await getPageDetail(record, user, accessLevel, usesPublishedFallback));
});

pageBrowseDetailRoutes.get("/:id/published", async (c) => {
  const record = await getPage(c.req.param("id"));

  if (!record) {
    return c.json({ published: false }, 404);
  }

  return c.json({
    published: await isPagePublishedInWorkspace(record.id, record.workspaceId),
  });
});
