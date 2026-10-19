import { and, asc, eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import {
  member,
  pageAccess,
  team,
  user as userTable,
  workspaceGuest,
} from "../../../infrastructure/database/schema";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { hasAccess, type AccessLevel } from "../../access/access-level";
import { getEffectivePageAccessForUsers } from "../../access/effective-access";
import { activeMembershipCondition } from "../../memberships/temporary-membership";
import { getPageTeamspaceSecurityPolicy } from "../../teamspaces/security";
import type { PageRecord } from "../read/page-records";

export async function getPageAccessRules(pageId: string) {
  const rules = await db
    .select()
    .from(pageAccess)
    .where(eq(pageAccess.pageId, pageId))
    .orderBy(asc(pageAccess.createdAt));

  return rules;
}

export async function getPageAccessTargets(record: PageRecord) {
  const [members, guests] = await Promise.all([
    db
      .select({
        email: userTable.email,
        id: userTable.id,
        memberId: member.id,
        name: userTable.name,
        role: member.role,
        accessExpiresAt: member.accessExpiresAt,
      })
      .from(member)
      .innerJoin(userTable, eq(member.userId, userTable.id))
      .where(and(eq(member.organizationId, record.workspaceId), activeMembershipCondition()))
      .orderBy(asc(userTable.name), asc(userTable.email)),
    db
      .select({
        email: userTable.email,
        id: userTable.id,
        guestId: workspaceGuest.id,
        name: userTable.name,
      })
      .from(workspaceGuest)
      .innerJoin(userTable, eq(workspaceGuest.userId, userTable.id))
      .where(eq(workspaceGuest.workspaceId, record.workspaceId))
      .orderBy(asc(userTable.name), asc(userTable.email)),
  ]);

  const accessByUserId = await getEffectivePageAccessForUsers(
    record.id,
    record.workspaceId,
    [...members, ...guests].map((targetUser) => targetUser.id),
  );
  const accessibleMembers = members.filter((targetMember) =>
    hasAccess(accessByUserId.get(targetMember.id) ?? "none", "view"),
  );

  const accessibleGuests = guests.filter((guest) =>
    hasAccess(accessByUserId.get(guest.id) ?? "none", "view"),
  );

  return { guests: accessibleGuests, members: accessibleMembers };
}

export async function grantPageAccess(
  record: PageRecord,
  targetType: "public" | "user" | "team",
  targetId: string,
  normalizedAccessLevel: AccessLevel,
) {
  if (targetType === "public") {
    const teamspacePolicy = await getPageTeamspaceSecurityPolicy(record.id);
    if (teamspacePolicy && !teamspacePolicy.publicSharingEnabled) {
      throw new ServiceMutationError("Public sharing is disabled for this teamspace.", 403);
    }
    if (targetId !== "*") {
      throw new ServiceMutationError("public targetId must be *", 400);
    }

    if (normalizedAccessLevel !== "view") {
      throw new ServiceMutationError("public access must be view", 400);
    }
  }

  let target: { id: string } | undefined;

  if (targetType === "public") {
    target = { id: "*" };
  } else if (targetType === "team") {
    [target] = await db
      .select({ id: team.id })
      .from(team)
      .where(and(eq(team.organizationId, record.workspaceId), eq(team.id, targetId)))
      .limit(1);
  } else {
    const [memberTargets, guestTargets] = await Promise.all([
      db
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.organizationId, record.workspaceId),
            eq(member.userId, targetId),
            activeMembershipCondition(),
          ),
        )
        .limit(1),
      db
        .select({ id: workspaceGuest.id })
        .from(workspaceGuest)
        .where(
          and(
            eq(workspaceGuest.workspaceId, record.workspaceId),
            eq(workspaceGuest.userId, targetId),
          ),
        )
        .limit(1),
    ]);
    target = memberTargets[0] ?? guestTargets[0];
  }

  if (!target) {
    throw new ServiceMutationError("Target not found", 404);
  }

  const { rule } = await db.transaction(async (tx) => {
    const [rule] = await tx
      .insert(pageAccess)
      .values({
        id: crypto.randomUUID(),
        accessLevel: normalizedAccessLevel,
        workspaceId: record.workspaceId,
        targetId,
        targetType,
        pageId: record.id,
      })
      .onConflictDoUpdate({
        target: [pageAccess.pageId, pageAccess.targetType, pageAccess.targetId],
        set: {
          accessLevel: normalizedAccessLevel,
          updatedAt: new Date(),
        },
      })
      .returning();
    return {
      rule,
    };
  });

  return { access: rule };
}

export async function removePublicPageAccess(pageId: string) {
  const { rule } = await db.transaction(async (tx) => {
    const [rule] = await tx
      .delete(pageAccess)
      .where(
        and(
          eq(pageAccess.pageId, pageId),
          eq(pageAccess.targetType, "public"),
          eq(pageAccess.targetId, "*"),
        ),
      )
      .returning();
    return {
      rule,
    };
  });

  return rule;
}

export async function removePageAccessRule(pageId: string, ruleId: string) {
  const { rule } = await db.transaction(async (tx) => {
    const [rule] = await tx
      .delete(pageAccess)
      .where(and(eq(pageAccess.id, ruleId), eq(pageAccess.pageId, pageId)))
      .returning();
    return {
      rule,
    };
  });

  return rule;
}
