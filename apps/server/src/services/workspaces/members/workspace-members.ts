import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import {
  session as authSession,
  member,
  team,
  teamMember,
  teamspace,
  teamspacePrincipal,
  user,
} from "../../../infrastructure/database/schema";
import type { ZilobaseEditionExtension } from "../../../shared/contracts/edition";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { activeMembershipCondition } from "../../memberships/temporary-membership";

export async function getWorkspaceAccessTargets(workspaceId: string) {
  const [members, teams] = await Promise.all([
    db
      .select({
        email: user.email,
        id: user.id,
        memberId: member.id,
        name: user.name,
        role: member.role,
        accessExpiresAt: member.accessExpiresAt,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(and(eq(member.organizationId, workspaceId), activeMembershipCondition()))
      .orderBy(asc(user.name), asc(user.email)),
    db
      .select({
        id: team.id,
        name: team.name,
      })
      .from(team)
      .where(eq(team.organizationId, workspaceId))
      .orderBy(asc(team.name)),
  ]);

  return { members, teams };
}

export async function updateWorkspaceMember(
  workspaceId: string,
  memberId: string,
  requestUser: { id: string },
  actorMembership: { role: string },
  input: { role: "owner" | "admin" | "member" | "temporary" },
  accessExpiresAt: Date | null,
  editionExtension?: ZilobaseEditionExtension | null,
) {
  const result = await db.transaction(async (transaction) => {
    const [target] = await transaction
      .select()
      .from(member)
      .where(and(eq(member.id, memberId), eq(member.organizationId, workspaceId)))
      .for("update")
      .limit(1);

    if (!target) {
      return { error: "Member not found.", status: 404 as const };
    }

    const changesOwnerRole = target.role === "owner" || input.role === "owner";

    if (changesOwnerRole && actorMembership.role !== "owner") {
      return {
        error: "Only workspace owners can change the owner role.",
        status: 403 as const,
      };
    }

    if (target.role === "owner" && input.role !== "owner") {
      const [{ count: ownerCount }] = await transaction
        .select({ count: sql<number>`count(*)::integer` })
        .from(member)
        .where(and(eq(member.organizationId, workspaceId), eq(member.role, "owner")));

      if ((ownerCount ?? 0) <= 1) {
        return {
          error: "The workspace must keep at least one owner.",
          status: 409 as const,
        };
      }
    }

    const [updated] = await transaction
      .update(member)
      .set({ accessExpiresAt, role: input.role })
      .where(eq(member.id, target.id))
      .returning();

    return { member: updated! };
  });

  if ("error" in result) {
    throw new ServiceMutationError(result.error!, result.status);
  }

  await editionExtension?.recordSecurityEvent({
    actorUserId: requestUser.id,
    database: db,
    details: {
      accessExpiresAt: result.member.accessExpiresAt?.toISOString() ?? null,
      role: result.member.role,
    },
    occurredAt: new Date(),
    type: "membership.updated",
    userId: result.member.userId,
    workspaceId,
  });

  return result.member;
}

export async function removeWorkspaceMember(
  workspaceId: string,
  memberId: string,
  requestUser: { id: string },
  editionExtension?: ZilobaseEditionExtension | null,
) {
  const result = await db.transaction(async (transaction) => {
    const [target] = await transaction
      .select()
      .from(member)
      .where(and(eq(member.id, memberId), eq(member.organizationId, workspaceId)))
      .for("update")
      .limit(1);

    if (!target) {
      return { error: "Member not found.", status: 404 as const };
    }

    if (target.role === "owner") {
      const [{ count: ownerCount }] = await transaction
        .select({ count: sql<number>`count(*)::integer` })
        .from(member)
        .where(and(eq(member.organizationId, workspaceId), eq(member.role, "owner")));

      if ((ownerCount ?? 0) <= 1) {
        return {
          error: "The workspace must keep at least one owner.",
          status: 409 as const,
        };
      }
    }

    const workspaceTeamIds = transaction
      .select({ id: team.id })
      .from(team)
      .where(eq(team.organizationId, workspaceId));
    const workspaceTeamspaceIds = transaction
      .select({ id: teamspace.id })
      .from(teamspace)
      .where(eq(teamspace.workspaceId, workspaceId));

    await transaction
      .delete(teamMember)
      .where(
        and(eq(teamMember.userId, target.userId), inArray(teamMember.teamId, workspaceTeamIds)),
      );
    await transaction
      .delete(teamspacePrincipal)
      .where(
        and(
          eq(teamspacePrincipal.principalType, "user"),
          eq(teamspacePrincipal.principalId, target.userId),
          inArray(teamspacePrincipal.teamspaceId, workspaceTeamspaceIds),
        ),
      );
    await transaction
      .update(authSession)
      .set({ activeTeamId: null, activeWorkspaceId: null })
      .where(
        and(eq(authSession.userId, target.userId), eq(authSession.activeWorkspaceId, workspaceId)),
      );
    await transaction.delete(member).where(eq(member.id, target.id));

    return { member: target };
  });

  if ("error" in result) {
    throw new ServiceMutationError(result.error!, result.status);
  }

  await editionExtension?.recordSecurityEvent({
    actorUserId: requestUser.id,
    database: db,
    details: { role: result.member.role },
    occurredAt: new Date(),
    type: "membership.removed",
    userId: result.member.userId,
    workspaceId,
  });
}
