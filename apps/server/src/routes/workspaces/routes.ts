import { Hono } from "hono";
import { getMembership } from "../../services/access/principal-access";
import {
  deleteWorkspace,
  getWorkspace,
  listWorkspaces,
} from "../../services/workspaces/workspaces";
import type { AppBindings } from "../../shared/contracts/http";
import { rejectMismatchedApiKeyWorkspace } from "../api-keys/access";
import {
  getPinnedWorkspaceId,
  rejectMismatchedPinnedWorkspace,
  requireOAuthScope,
} from "../auth/oauth/oauth-access";
import { getAuthenticatedUser as requireUser } from "../http/auth";
import { attachServiceErrorHandler } from "../http/route-error";
import { parseJsonBody } from "../http/schema-json";
import { DeleteWorkspaceInput, strictJson } from "./input";
import { postMemberInvitation } from "./invitations/handlers";
import { deleteMember, getAccessTargets, patchMember } from "./members/handlers";
import { patchWorkspaceSettings } from "./settings/handlers";

export const workspaceRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

workspaceRoutes.use("*", async (c, next) => {
  if (c.get("authMethod") !== "oauth") {
    await next();
    return;
  }

  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    return c.json(
      {
        error: "insufficient_scope",
        error_description: "OAuth tokens cannot change workspace membership.",
      },
      403,
    );
  }

  const denied = requireOAuthScope(c, "workspaces.read");
  if (denied) {
    return denied;
  }

  await next();
});

workspaceRoutes.get("/", async (c) => {
  const requestUser = requireUser(c);
  if (!requestUser) return c.json({ error: "Unauthorized" }, 401);
  const pinnedWorkspaceId = getPinnedWorkspaceId(c);
  const records = await listWorkspaces(requestUser.id, pinnedWorkspaceId);

  return c.json({ workspaces: records.map(({ workspace: record }) => record) });
});

workspaceRoutes.get("/:workspaceId", async (c) => {
  const requestUser = requireUser(c);
  if (!requestUser) return c.json({ error: "Unauthorized" }, 401);
  const workspaceId = c.req.param("workspaceId");
  const denied = rejectMismatchedPinnedWorkspace(c, workspaceId);
  if (denied) return denied;
  if (!(await getMembership(workspaceId, requestUser.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const record = await getWorkspace(workspaceId);

  return record ? c.json({ workspace: record }) : c.json({ error: "Workspace not found" }, 404);
});

workspaceRoutes.get("/:workspaceId/access-targets", getAccessTargets);

workspaceRoutes.post("/:workspaceId/member-invitations", postMemberInvitation);

workspaceRoutes.patch("/:workspaceId/members/:memberId", patchMember);

workspaceRoutes.delete("/:workspaceId/members/:memberId", deleteMember);

workspaceRoutes.patch("/:workspaceId", patchWorkspaceSettings);

workspaceRoutes.delete("/:workspaceId", async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceId = c.req.param("workspaceId");
  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  const membership = await getMembership(workspaceId, requestUser.id);

  if (!membership || membership.role !== "owner") {
    return c.json({ error: "Only the workspace owner can delete this workspace." }, 403);
  }

  const parsed = await parseJsonBody(c.req, DeleteWorkspaceInput, strictJson);

  if (!parsed.ok) {
    return c.json({ error: "Enter the workspace name to confirm deletion." }, 400);
  }

  await deleteWorkspace(workspaceId, parsed.data.confirmationName);

  return c.json({ deleted: true, workspaceId });
});
