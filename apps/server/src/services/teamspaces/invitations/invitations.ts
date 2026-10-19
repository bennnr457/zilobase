import { and, eq, isNull } from "drizzle-orm";
import { teamspace, teamspacePrincipal } from "../../../infrastructure/database/schema";
import { getMembership } from "../../access/principal-access";
import { TeamspaceManagementError } from "../contracts";
import type { TeamspaceOperationContext } from "../management";
import { createInviteToken, hashInviteToken } from "./invite-tokens";
export async function updateInviteLink(
  context: TeamspaceOperationContext,
  input: {
    enabled: boolean;
    teamspaceId: string;
    userId: string;
    workspaceId: string;
  },
) {
  const { record } = await context.requireManage(input);
  const token = input.enabled ? createInviteToken() : null;
  await context.database
    .update(teamspace)
    .set({
      inviteLinkEnabled: input.enabled,
      inviteLinkTokenHash: token ? await hashInviteToken(token) : null,
      updatedAt: new Date(),
    })
    .where(eq(teamspace.id, record.id));
  await context.audit("teamspace.invite_link_changed", input, {
    enabled: input.enabled,
    teamspaceId: record.id,
  });
  return { enabled: input.enabled, token };
}

export async function acceptInvite(
  context: TeamspaceOperationContext,
  input: { token: string; userId: string; workspaceId: string },
) {
  const membership = await getMembership(input.workspaceId, input.userId);
  if (!membership) throw new TeamspaceManagementError("Forbidden", 403);
  const [record] = await context.database
    .select()
    .from(teamspace)
    .where(
      and(
        eq(teamspace.workspaceId, input.workspaceId),
        eq(teamspace.inviteLinkEnabled, true),
        eq(teamspace.inviteLinkTokenHash, await hashInviteToken(input.token)),
        isNull(teamspace.archivedAt),
      ),
    )
    .limit(1);
  if (!record) throw new TeamspaceManagementError("Invite link is invalid.", 404);
  const [principal] = await context.database
    .insert(teamspacePrincipal)
    .values({
      addedById: input.userId,
      id: crypto.randomUUID(),
      membershipSource: "invite_link",
      principalId: input.userId,
      principalType: "user",
      role: "member",
      teamspaceId: record.id,
    })
    .onConflictDoNothing()
    .returning();
  return {
    principal: principal ?? (await context.getDirectPrincipal(record.id, input.userId)),
    teamspaceId: record.id,
  };
}
