import type { Handler } from "hono";
import { getMembership, isPrivilegedOrgRole } from "../../../services/access/principal-access";
import {
  parseMembershipAccessExpiry,
  TemporaryMembershipValidationError,
} from "../../../services/memberships/temporary-membership";
import {
  getWorkspaceAccessTargets,
  removeWorkspaceMember,
  updateWorkspaceMember,
} from "../../../services/workspaces/members/workspace-members";
import type { AppBindings } from "../../../shared/contracts/http";
import { rejectMismatchedApiKeyWorkspace } from "../../api-keys/access";
import { getAuthenticatedUser as requireUser } from "../../http/auth";
import { parseJsonBody } from "../../http/schema-json";
import { MemberUpdateInput, strictJson } from "../input";
export const getAccessTargets: Handler<AppBindings, "/:workspaceId/access-targets"> = async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceId = c.req.param("workspaceId");
  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  if (!(await getMembership(workspaceId, requestUser.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const { members, teams } = await getWorkspaceAccessTargets(workspaceId);

  return c.json({ members, teams });
};
export const patchMember: Handler<AppBindings, "/:workspaceId/members/:memberId"> = async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceId = c.req.param("workspaceId");
  const actorMembership = await getMembership(workspaceId, requestUser.id);

  if (!actorMembership || !isPrivilegedOrgRole(actorMembership.role)) {
    return c.json({ error: "Only workspace admins can manage members." }, 403);
  }

  const parsed = await parseJsonBody(c.req, MemberUpdateInput, strictJson);

  if (!parsed.ok) {
    return c.json({ error: parsed.message || "Invalid member update." }, 400);
  }

  let accessExpiresAt: Date | null;

  try {
    accessExpiresAt = parseMembershipAccessExpiry(parsed.data.role, parsed.data.accessExpiresAt);
  } catch (error) {
    if (error instanceof TemporaryMembershipValidationError) {
      return c.json({ error: error.message }, 400);
    }

    throw error;
  }

  const updatedMember = await updateWorkspaceMember(
    workspaceId,
    c.req.param("memberId"),
    requestUser,
    actorMembership,
    parsed.data,
    accessExpiresAt,
    c.get("editionExtension"),
  );

  return c.json({ member: updatedMember });
};
export const deleteMember: Handler<AppBindings, "/:workspaceId/members/:memberId"> = async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceId = c.req.param("workspaceId");
  const actorMembership = await getMembership(workspaceId, requestUser.id);

  if (!actorMembership || !isPrivilegedOrgRole(actorMembership.role)) {
    return c.json({ error: "Only workspace admins can remove members." }, 403);
  }

  await removeWorkspaceMember(
    workspaceId,
    c.req.param("memberId"),
    requestUser,
    c.get("editionExtension"),
  );

  return c.json({ removed: true });
};
