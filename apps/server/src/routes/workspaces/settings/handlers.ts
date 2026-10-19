import type { Handler } from "hono";
import { getMembership, isPrivilegedOrgRole } from "../../../services/access/principal-access";
import { updateWorkspaceSettings } from "../../../services/workspaces/settings/workspace-settings";
import type { AppBindings } from "../../../shared/contracts/http";
import { rejectMismatchedApiKeyWorkspace } from "../../api-keys/access";
import { getAuthenticatedUser as requireUser } from "../../http/auth";
import { parseJsonBody } from "../../http/schema-json";
import { UpdateWorkspaceInput } from "../input";
export const patchWorkspaceSettings: Handler<AppBindings, "/:workspaceId"> = async (c) => {
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

  if (!membership) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (!isPrivilegedOrgRole(membership.role)) {
    return c.json({ error: "Only workspace admins can update settings." }, 403);
  }

  const parsed = await parseJsonBody(c.req, UpdateWorkspaceInput);

  if (!parsed.ok) {
    return c.json({ error: parsed.message || "Invalid request." }, 400);
  }

  const updatedWorkspace = await updateWorkspaceSettings(workspaceId, parsed.data);

  return c.json(updatedWorkspace);
};
