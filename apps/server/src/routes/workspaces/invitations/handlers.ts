import type { Handler } from "hono";
import { getMembership, isPrivilegedOrgRole } from "../../../services/access/principal-access";
import {
  parseMembershipAccessExpiry,
  TemporaryMembershipValidationError,
} from "../../../services/memberships/temporary-membership";
import { createWorkspaceInvitation } from "../../../services/workspaces/invitations/workspace-invitations";
import type { AppBindings } from "../../../shared/contracts/http";
import { rejectMismatchedApiKeyWorkspace } from "../../api-keys/access";
import { getAuthenticatedUser as requireUser } from "../../http/auth";
import { parseJsonBody } from "../../http/schema-json";
import { MemberInvitationInput, strictJson } from "../input";
export const postMemberInvitation: Handler<
  AppBindings,
  "/:workspaceId/member-invitations"
> = async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceId = c.req.param("workspaceId");
  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  const actorMembership = await getMembership(workspaceId, requestUser.id);

  if (!actorMembership || !isPrivilegedOrgRole(actorMembership.role)) {
    return c.json({ error: "Only workspace admins can invite members." }, 403);
  }

  const parsed = await parseJsonBody(c.req, MemberInvitationInput, strictJson);

  if (!parsed.ok) {
    return c.json({ error: parsed.message || "Invalid invitation." }, 400);
  }

  let membershipExpiresAt: Date | null;

  try {
    membershipExpiresAt = parseMembershipAccessExpiry(
      parsed.data.role,
      parsed.data.accessExpiresAt,
    );
  } catch (error) {
    if (error instanceof TemporaryMembershipValidationError) {
      return c.json({ error: error.message }, 400);
    }

    throw error;
  }

  const created = await createWorkspaceInvitation(
    workspaceId,
    requestUser,
    parsed.data,
    membershipExpiresAt,
    c.env,
  );

  return c.json({ invitation: created }, 201);
};
