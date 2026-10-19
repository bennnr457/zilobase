import { and, eq, sql } from "drizzle-orm";
import { teamspacePrincipal } from "../../../infrastructure/database/schema";
import { getMembership } from "../../access/principal-access";
import { TeamspaceManagementError } from "../contracts";
import type { TeamspaceOperationContext } from "../management";
import { canJoinTeamspace, type TeamspaceAccessMode } from "../policy";
export async function join(
  context: TeamspaceOperationContext,
  input: { teamspaceId: string; userId: string; workspaceId: string },
) {
  const [membership, record] = await Promise.all([
    getMembership(input.workspaceId, input.userId),
    context.getRecord(input.workspaceId, input.teamspaceId),
  ]);
  if (!membership) throw new TeamspaceManagementError("Forbidden", 403);
  if (!record) throw new TeamspaceManagementError("Teamspace not found.", 404);
  if (
    !canJoinTeamspace({
      accessMode: record.accessMode as TeamspaceAccessMode,
      archived: Boolean(record.archivedAt),
      isActiveWorkspaceMember: true,
    })
  ) {
    throw new TeamspaceManagementError("This teamspace cannot be joined.", 403);
  }
  const [created] = await context.database
    .insert(teamspacePrincipal)
    .values({
      addedById: input.userId,
      id: crypto.randomUUID(),
      membershipSource: "self_join",
      principalId: input.userId,
      principalType: "user",
      role: "member",
      teamspaceId: record.id,
    })
    .onConflictDoNothing()
    .returning();
  if (created) {
    await context.audit("teamspace.joined", input, { teamspaceId: record.id });
  }
  return created ?? (await context.getDirectPrincipal(record.id, input.userId));
}

export async function leave(
  context: TeamspaceOperationContext,
  input: { teamspaceId: string; userId: string; workspaceId: string },
) {
  const record = await context.getRecord(input.workspaceId, input.teamspaceId);
  if (!record) throw new TeamspaceManagementError("Teamspace not found.", 404);
  if (record.isDefault) {
    throw new TeamspaceManagementError("Default teamspaces cannot be left.", 409);
  }
  const principal = await context.getDirectPrincipal(record.id, input.userId);
  if (!principal) throw new TeamspaceManagementError("Membership not found.", 404);
  if (principal.role === "owner") {
    const [{ count }] = await context.database
      .select({ count: sql<number>`count(*)::integer` })
      .from(teamspacePrincipal)
      .where(
        and(eq(teamspacePrincipal.teamspaceId, record.id), eq(teamspacePrincipal.role, "owner")),
      );
    if ((count ?? 0) <= 1) {
      throw new TeamspaceManagementError("Assign another owner before leaving.", 409);
    }
  }
  await context.database.delete(teamspacePrincipal).where(eq(teamspacePrincipal.id, principal.id));
  await context.audit("teamspace.left", input, { teamspaceId: record.id });
  return { removed: true };
}
