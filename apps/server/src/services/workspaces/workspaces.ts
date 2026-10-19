import { and, asc, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/index";
import {
  session as authSession,
  instanceSettings,
  member,
  workspace,
} from "../../infrastructure/database/schema";
import { ServiceMutationError } from "../../shared/errors/service-mutation-error";
import { activeMembershipCondition } from "../memberships/temporary-membership";

export async function listWorkspaces(userId: string, pinnedWorkspaceId: string | null) {
  const records = await db
    .select({ workspace })
    .from(workspace)
    .innerJoin(member, eq(member.organizationId, workspace.id))
    .where(
      and(
        eq(member.userId, userId),
        activeMembershipCondition(),
        pinnedWorkspaceId ? eq(workspace.id, pinnedWorkspaceId) : undefined,
      ),
    )
    .orderBy(asc(workspace.name));
  return records;
}

export async function getWorkspace(workspaceId: string) {
  const [record] = await db.select().from(workspace).where(eq(workspace.id, workspaceId)).limit(1);
  return record;
}

export async function deleteWorkspace(workspaceId: string, confirmationName: string) {
  const [targetWorkspace] = await db
    .select({ id: workspace.id, name: workspace.name })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);

  if (!targetWorkspace) {
    throw new ServiceMutationError("Workspace not found.", 404);
  }

  if (confirmationName.trim() !== targetWorkspace.name) {
    throw new ServiceMutationError("The workspace name does not match.", 400);
  }

  const [pinnedInstance] = await db
    .select({ id: instanceSettings.id })
    .from(instanceSettings)
    .where(eq(instanceSettings.pinnedWorkspaceId, workspaceId))
    .limit(1);

  if (pinnedInstance) {
    throw new ServiceMutationError(
      "This workspace is pinned by the instance administrator and cannot be deleted.",
      409,
    );
  }

  await db.transaction(async (transaction) => {
    await transaction
      .update(authSession)
      .set({ activeTeamId: null, activeWorkspaceId: null })
      .where(eq(authSession.activeWorkspaceId, workspaceId));
    await transaction.delete(workspace).where(eq(workspace.id, workspaceId));
  });
}
