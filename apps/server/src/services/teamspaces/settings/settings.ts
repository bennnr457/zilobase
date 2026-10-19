import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  member,
  teamspace,
  teamspacePrincipal,
  workspace,
} from "../../../infrastructure/database/schema";
import { getMembership } from "../../access/principal-access";
import { activeMembershipCondition } from "../../memberships/temporary-membership";
import { TeamspaceManagementError } from "../contracts";
import type { TeamspaceOperationContext } from "../management";
import { type TeamspaceCreationPolicy } from "../policy";
export async function updateDefaults(
  context: TeamspaceOperationContext,
  input: {
    defaultTeamspaceIds: string[];
    userId: string;
    workspaceId: string;
  },
) {
  const membership = await getMembership(input.workspaceId, input.userId);
  if (membership?.role !== "owner") {
    throw new TeamspaceManagementError("Only workspace owners can change defaults.", 403);
  }
  const ids = [...new Set(input.defaultTeamspaceIds)];
  if (ids.length === 0) {
    throw new TeamspaceManagementError("At least one default teamspace is required.", 409);
  }
  const records = await context.database
    .select({ id: teamspace.id })
    .from(teamspace)
    .where(
      and(
        eq(teamspace.workspaceId, input.workspaceId),
        inArray(teamspace.id, ids),
        isNull(teamspace.archivedAt),
      ),
    );
  if (records.length !== ids.length) {
    throw new TeamspaceManagementError("A default teamspace was not found.", 404);
  }
  const members = await context.database
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, input.workspaceId), activeMembershipCondition()));
  await context.database.transaction(async (transaction) => {
    await transaction
      .update(teamspace)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(teamspace.workspaceId, input.workspaceId));
    await transaction
      .update(teamspace)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(inArray(teamspace.id, ids));
    for (const defaultId of ids) {
      for (const workspaceMember of members) {
        await transaction
          .insert(teamspacePrincipal)
          .values({
            addedById: input.userId,
            id: crypto.randomUUID(),
            membershipSource: "default",
            principalId: workspaceMember.userId,
            principalType: "user",
            role: "member",
            teamspaceId: defaultId,
          })
          .onConflictDoNothing();
      }
    }
  });
  await context.audit("teamspace.defaults_changed", input, {
    defaultCount: ids.length,
  });
  return { defaultTeamspaceIds: ids };
}

export async function getWorkspaceSettings(
  context: TeamspaceOperationContext,
  workspaceId: string,
  userId: string,
) {
  const membership = await getMembership(workspaceId, userId);
  if (!membership) throw new TeamspaceManagementError("Forbidden", 403);
  const [record] = await context.database
    .select({ creationPolicy: workspace.teamspaceCreationPolicy })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);
  return {
    canManage: membership.role === "owner",
    creationPolicy: record?.creationPolicy ?? "workspace_members",
  };
}

export async function updateWorkspaceSettings(
  context: TeamspaceOperationContext,
  input: {
    creationPolicy: TeamspaceCreationPolicy;
    userId: string;
    workspaceId: string;
  },
) {
  const membership = await getMembership(input.workspaceId, input.userId);
  if (membership?.role !== "owner") {
    throw new TeamspaceManagementError("Only workspace owners can change teamspace policy.", 403);
  }
  const [updated] = await context.database
    .update(workspace)
    .set({
      teamspaceCreationPolicy: input.creationPolicy,
      updatedAt: new Date(),
    })
    .where(eq(workspace.id, input.workspaceId))
    .returning({ creationPolicy: workspace.teamspaceCreationPolicy });
  await context.audit("teamspace.creation_policy_changed", input, {
    creationPolicy: input.creationPolicy,
  });
  return { canManage: true, ...updated! };
}
