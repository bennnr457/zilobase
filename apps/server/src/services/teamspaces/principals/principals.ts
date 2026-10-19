import { and, asc, eq } from "drizzle-orm";
import { member, team, teamspacePrincipal, user } from "../../../infrastructure/database/schema";
import { activeMembershipCondition } from "../../memberships/temporary-membership";
import { TeamspaceManagementError } from "../contracts";
import type { TeamspaceOperationContext } from "../management";
import {
  canInviteTeamspaceMembers,
  type TeamspaceInvitePolicy,
  type TeamspaceRole,
} from "../policy";
export async function listPrincipals(
  context: TeamspaceOperationContext,
  input: { teamspaceId: string; userId: string; workspaceId: string },
) {
  await context.get(input);
  const rows = await context.database
    .select({
      accessLevelOverride: teamspacePrincipal.accessLevelOverride,
      createdAt: teamspacePrincipal.createdAt,
      email: user.email,
      id: teamspacePrincipal.id,
      membershipSource: teamspacePrincipal.membershipSource,
      name: user.name,
      teamName: team.name,
      principalId: teamspacePrincipal.principalId,
      principalType: teamspacePrincipal.principalType,
      role: teamspacePrincipal.role,
    })
    .from(teamspacePrincipal)
    .leftJoin(
      user,
      and(
        eq(teamspacePrincipal.principalType, "user"),
        eq(teamspacePrincipal.principalId, user.id),
      ),
    )
    .leftJoin(
      team,
      and(
        eq(teamspacePrincipal.principalType, "team"),
        eq(teamspacePrincipal.principalId, team.id),
      ),
    )
    .where(eq(teamspacePrincipal.teamspaceId, input.teamspaceId))
    .orderBy(asc(user.name), asc(user.email));
  return rows.map(({ teamName, ...row }) => ({
    ...row,
    name: row.name ?? teamName,
  }));
}

export async function addPrincipal(
  context: TeamspaceOperationContext,
  input: {
    accessLevelOverride?: "view" | "comment" | "edit" | "full" | null;
    principalType?: "user" | "team";
    role: TeamspaceRole;
    targetUserId: string;
    teamspaceId: string;
    userId: string;
    workspaceId: string;
  },
) {
  const { record, role } = await context.requireVisible(input);
  if (
    !canInviteTeamspaceMembers({
      invitePolicy: record.invitePolicy as TeamspaceInvitePolicy,
      teamspaceRole: role,
    })
  ) {
    throw new TeamspaceManagementError("Forbidden", 403);
  }
  if (input.role === "owner" && role !== "owner") {
    throw new TeamspaceManagementError("Only owners can add owners.", 403);
  }
  const principalType = input.principalType ?? "user";
  const [target] =
    principalType === "user"
      ? await context.database
          .select({ id: member.id })
          .from(member)
          .where(
            and(
              eq(member.organizationId, input.workspaceId),
              eq(member.userId, input.targetUserId),
              activeMembershipCondition(),
            ),
          )
          .limit(1)
      : await context.database
          .select({ id: team.id })
          .from(team)
          .where(and(eq(team.organizationId, input.workspaceId), eq(team.id, input.targetUserId)))
          .limit(1);
  if (!target) {
    throw new TeamspaceManagementError(
      principalType === "user"
        ? "Only active workspace members can join a teamspace."
        : "The sharing group was not found in this workspace.",
      409,
    );
  }
  const [created] = await context.database
    .insert(teamspacePrincipal)
    .values({
      addedById: input.userId,
      accessLevelOverride: input.accessLevelOverride ?? null,
      id: crypto.randomUUID(),
      membershipSource: "explicit",
      principalId: input.targetUserId,
      principalType,
      role: input.role,
      teamspaceId: input.teamspaceId,
    })
    .onConflictDoNothing()
    .returning();
  if (!created) {
    throw new TeamspaceManagementError("This member or group is already in the teamspace.", 409);
  }
  await context.audit("teamspace.principal_added", input, {
    role: input.role,
    teamspaceId: input.teamspaceId,
  });
  return created;
}

export async function updatePrincipal(
  context: TeamspaceOperationContext,
  input: {
    accessLevelOverride?: "view" | "comment" | "edit" | "full" | null;
    principalId: string;
    role: TeamspaceRole;
    teamspaceId: string;
    userId: string;
    workspaceId: string;
  },
) {
  await context.requireManage(input);
  const principal = await context.getPrincipal(input.teamspaceId, input.principalId);
  if (!principal) throw new TeamspaceManagementError("Member not found.", 404);
  await context.assertOwnerRemains(input.teamspaceId, principal, input.role);
  const [updated] = await context.database
    .update(teamspacePrincipal)
    .set({
      role: input.role,
      ...(input.accessLevelOverride !== undefined
        ? { accessLevelOverride: input.accessLevelOverride }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(teamspacePrincipal.id, principal.id))
    .returning();
  await context.audit("teamspace.role_changed", input, {
    role: input.role,
    teamspaceId: input.teamspaceId,
  });
  return updated!;
}

export async function removePrincipal(
  context: TeamspaceOperationContext,
  input: {
    principalId: string;
    teamspaceId: string;
    userId: string;
    workspaceId: string;
  },
) {
  await context.requireManage(input);
  const principal = await context.getPrincipal(input.teamspaceId, input.principalId);
  if (!principal) throw new TeamspaceManagementError("Member not found.", 404);
  await context.assertOwnerRemains(input.teamspaceId, principal, "member");
  await context.database.delete(teamspacePrincipal).where(eq(teamspacePrincipal.id, principal.id));
  await context.audit("teamspace.principal_removed", input, {
    teamspaceId: input.teamspaceId,
  });
  return { removed: true };
}
