import { getPageRecord, loadStandaloneDatabaseForPage } from "./resource-access-records";
import {
  strongestExplicitAccess,
  principalGrantTargets,
  teamspacePrincipalAccess,
} from "./access-decisions";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import {
  database,
  databaseAccess,
  member,
  page,
  pageAccess,
  teamMember,
  teamspace,
  teamspacePrincipal,
  workspaceGuest,
} from "../../infrastructure/database/schema";
import { loadWorkspacePageGraph } from "../pages/graph";
import { activeMembershipCondition } from "../memberships";
import { getDatabaseTeamspaceSecurityPolicy, getPageTeamspaceSecurityPolicy } from "../teamspaces";
import {
  accessRank,
  hasAccess,
  maxAccess,
  normalizeAccessLevel,
  type AccessLevel,
} from "./access-level";
import { getMembership, getWorkspaceGuest } from "./principal-access";

async function getEffectivePageAccess(pageId: string, userId: string): Promise<AccessLevel> {
  const [context] = await db
    .select({
      workspaceId: page.workspaceId,
    })
    .from(page)
    .where(and(eq(page.id, pageId), isNull(page.deletedAt)))
    .limit(1);

  if (!context) {
    return "none";
  }

  return getEffectivePageAccessInWorkspace(pageId, context.workspaceId, userId);
}

export async function getEffectivePageAccessInWorkspace(
  pageId: string,
  workspaceId: string,
  userId: string,
): Promise<AccessLevel> {
  const [membershipRows, guestRows, graph] = await Promise.all([
    db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, workspaceId),
          eq(member.userId, userId),
          activeMembershipCondition(),
        ),
      )
      .limit(1),
    db
      .select({ id: workspaceGuest.id })
      .from(workspaceGuest)
      .where(and(eq(workspaceGuest.workspaceId, workspaceId), eq(workspaceGuest.userId, userId)))
      .limit(1),
    loadWorkspacePageGraph(workspaceId),
  ]);
  const isMember = membershipRows.length > 0;

  if (!isMember && guestRows.length === 0) {
    return "none";
  }

  const teamRows = isMember
    ? await db
        .select({ teamId: teamMember.teamId })
        .from(teamMember)
        .where(eq(teamMember.userId, userId))
    : [];

  const ancestorIds = graph.getAncestorIds(pageId);
  const pageTeamspaceId = graph.getTeamspaceId?.(pageId) ?? null;

  if (
    isMember &&
    !pageTeamspaceId &&
    ancestorIds.length > 0 &&
    graph.hasOwnedRootAccess(ancestorIds, userId)
  ) {
    return "full";
  }

  const { targetTypes, targetIds } = principalGrantTargets(
    userId,
    teamRows.map((row) => row.teamId),
  );

  const rules =
    ancestorIds.length > 0
      ? await db
          .select({ accessLevel: pageAccess.accessLevel })
          .from(pageAccess)
          .where(
            and(
              eq(pageAccess.workspaceId, workspaceId),
              inArray(pageAccess.pageId, ancestorIds),
              inArray(pageAccess.targetType, targetTypes),
              inArray(pageAccess.targetId, targetIds),
            ),
          )
      : [];

  const pageLevel = strongestExplicitAccess(rules);

  if (!isMember) {
    if (pageTeamspaceId && !(await getPageTeamspaceSecurityPolicy(pageId))?.guestsEnabled) {
      return "none";
    }
    return pageLevel;
  }

  if (pageTeamspaceId) {
    const teamspaceLevel = await resolveTeamspaceAccess(
      pageTeamspaceId,
      workspaceId,
      userId,
      teamRows.map((row) => row.teamId),
    );
    return maxAccess(pageLevel, teamspaceLevel);
  }

  if (pageLevel !== "none") {
    return pageLevel;
  }

  const standaloneDatabaseRow = await loadStandaloneDatabaseForPage(pageId, workspaceId);

  return standaloneDatabaseRow
    ? resolveEffectiveDatabaseAccessInWorkspace(
        standaloneDatabaseRow.databaseId,
        workspaceId,
        userId,
        {
          membershipVerified: true,
          teamIds: teamRows.map((row) => row.teamId),
        },
      )
    : "none";
}

async function isPagePublished(pageId: string) {
  const record = await getPageRecord(pageId);

  if (!record) {
    return false;
  }

  return isPagePublishedInWorkspace(pageId, record.workspaceId);
}

export async function isPagePublishedInWorkspace(
  pageId: string,
  workspaceId: string,
): Promise<boolean> {
  const graph = await loadWorkspacePageGraph(workspaceId);
  if (graph.getTeamspaceId?.(pageId)) {
    const policy = await getPageTeamspaceSecurityPolicy(pageId);
    if (policy && !policy.publicSharingEnabled) return false;
  }
  const ancestorIds = graph.getAncestorIds(pageId);

  if (ancestorIds.length > 0) {
    const [rule] = await db
      .select({ id: pageAccess.id })
      .from(pageAccess)
      .where(
        and(
          eq(pageAccess.workspaceId, workspaceId),
          inArray(pageAccess.pageId, ancestorIds),
          eq(pageAccess.targetType, "public"),
          eq(pageAccess.targetId, "*"),
        ),
      )
      .limit(1);

    if (rule) {
      return true;
    }
  }

  const standaloneDatabaseRow = await loadStandaloneDatabaseForPage(pageId, workspaceId);

  return standaloneDatabaseRow
    ? isDatabasePublishedInWorkspace(standaloneDatabaseRow.databaseId, workspaceId)
    : false;
}

export async function canAccessPage(
  pageId: string,
  userId: string,
  required: Exclude<AccessLevel, "none">,
) {
  return hasAccess(await getEffectivePageAccess(pageId, userId), required);
}

export async function canAccessPageInWorkspace(
  pageId: string,
  workspaceId: string,
  userId: string,
  required: Exclude<AccessLevel, "none">,
) {
  return hasAccess(await getEffectivePageAccessInWorkspace(pageId, workspaceId, userId), required);
}

export async function getEffectiveDatabaseAccessInWorkspace(
  databaseId: string,
  workspaceId: string,
  userId: string,
): Promise<AccessLevel> {
  return resolveEffectiveDatabaseAccessInWorkspace(databaseId, workspaceId, userId);
}

async function resolveEffectiveDatabaseAccessInWorkspace(
  databaseId: string,
  workspaceId: string,
  userId: string,
  context?: { membershipVerified: true; teamIds: string[] },
): Promise<AccessLevel> {
  const [record] = await db
    .select({
      createdById: database.createdById,
      pageId: database.pageId,
      teamspaceId: database.teamspaceId,
    })
    .from(database)
    .where(
      and(
        eq(database.id, databaseId),
        eq(database.workspaceId, workspaceId),
        isNull(database.deletedAt),
      ),
    )
    .limit(1);

  if (!record) return "none";
  return resolveEffectiveDatabaseAccessForRecord(
    { ...record, id: databaseId, workspaceId },
    userId,
    context,
  );
}

export type DatabaseAccessRecord = Pick<
  typeof database.$inferSelect,
  "createdById" | "id" | "pageId" | "workspaceId"
> &
  Partial<Pick<typeof database.$inferSelect, "deletedAt" | "teamspaceId">>;

export function getEffectiveDatabaseAccessForRecord(
  record: DatabaseAccessRecord,
  userId: string,
): Promise<AccessLevel> {
  return resolveEffectiveDatabaseAccessForRecord(record, userId);
}

async function resolveEffectiveDatabaseAccessForRecord(
  record: DatabaseAccessRecord,
  userId: string,
  context?: { membershipVerified: true; teamIds: string[] },
): Promise<AccessLevel> {
  if (record.deletedAt) return "none";

  if (record.pageId) {
    return getEffectivePageAccessInWorkspace(record.pageId, record.workspaceId, userId);
  }
  if (!context?.membershipVerified && !(await getMembership(record.workspaceId, userId))) {
    return "none";
  }
  if (!record.teamspaceId && record.createdById === userId) return "full";
  const teamIds =
    context?.teamIds ??
    (
      await db
        .select({ teamId: teamMember.teamId })
        .from(teamMember)
        .where(eq(teamMember.userId, userId))
    ).map((row) => row.teamId);
  const { targetTypes, targetIds } = principalGrantTargets(userId, teamIds);
  const rules = await db
    .select({ accessLevel: databaseAccess.accessLevel })
    .from(databaseAccess)
    .where(
      and(
        eq(databaseAccess.databaseId, record.id),
        inArray(databaseAccess.targetType, targetTypes),
        inArray(databaseAccess.targetId, targetIds),
      ),
    );

  const explicitLevel = strongestExplicitAccess(rules);

  if (record.teamspaceId) {
    return maxAccess(
      explicitLevel,
      await resolveTeamspaceAccess(record.teamspaceId, record.workspaceId, userId, teamIds),
    );
  }

  return explicitLevel;
}

export async function canAccessDatabaseInWorkspace(
  databaseId: string,
  workspaceId: string,
  userId: string,
  required: Exclude<AccessLevel, "none">,
) {
  return hasAccess(
    await getEffectiveDatabaseAccessInWorkspace(databaseId, workspaceId, userId),
    required,
  );
}

export async function canAccessDatabaseRecord(
  record: DatabaseAccessRecord,
  userId: string,
  required: Exclude<AccessLevel, "none">,
) {
  return hasAccess(await getEffectiveDatabaseAccessForRecord(record, userId), required);
}

export async function isDatabasePublishedInWorkspace(
  databaseId: string,
  workspaceId: string,
): Promise<boolean> {
  const [record] = await db
    .select({ pageId: database.pageId, teamspaceId: database.teamspaceId })
    .from(database)
    .where(and(eq(database.id, databaseId), eq(database.workspaceId, workspaceId)))
    .limit(1);

  if (record?.pageId) {
    return isPagePublishedInWorkspace(record.pageId, workspaceId);
  }

  if (record?.teamspaceId) {
    const policy = await getDatabaseTeamspaceSecurityPolicy(databaseId);
    if (policy && !policy.publicSharingEnabled) return false;
  }

  const [rule] = await db
    .select({ id: databaseAccess.id })
    .from(databaseAccess)
    .where(
      and(
        eq(databaseAccess.databaseId, databaseId),
        eq(databaseAccess.targetType, "public"),
        eq(databaseAccess.targetId, "*"),
      ),
    )
    .limit(1);
  return Boolean(rule);
}

export async function getAccessiblePageIds(
  workspaceId: string,
  userId: string,
  options: { membershipVerified?: boolean } = {},
) {
  let isMember = options.membershipVerified === true;

  if (!options.membershipVerified) {
    const membership = await getMembership(workspaceId, userId);

    if (membership) {
      isMember = true;
    } else if (!(await getWorkspaceGuest(workspaceId, userId))) {
      return new Set<string>();
    }
  }

  const [graph, pages, teamRows] = await Promise.all([
    loadWorkspacePageGraph(workspaceId),
    db
      .select({
        createdById: page.createdById,
        id: page.id,
        teamspaceId: page.teamspaceId,
      })
      .from(page)
      .where(and(eq(page.workspaceId, workspaceId), isNull(page.deletedAt))),
    isMember
      ? db
          .select({ teamId: teamMember.teamId })
          .from(teamMember)
          .where(eq(teamMember.userId, userId))
      : Promise.resolve([]),
  ]);
  const { targetTypes, targetIds } = principalGrantTargets(
    userId,
    teamRows.map((row) => row.teamId),
  );

  const rules =
    targetIds.length > 0
      ? await db
          .select({ pageId: pageAccess.pageId })
          .from(pageAccess)
          .where(
            and(
              eq(pageAccess.workspaceId, workspaceId),
              inArray(pageAccess.targetType, targetTypes),
              inArray(pageAccess.targetId, targetIds),
            ),
          )
      : [];
  const accessible = new Set<string>();
  const sharedRoots = new Set(rules.map((rule) => rule.pageId));
  const teamspaceIds = [
    ...new Set(pages.map((item) => item.teamspaceId).filter((id): id is string => Boolean(id))),
  ];
  const teamspaceAccess = new Map<string, AccessLevel>();

  if (isMember) {
    await Promise.all(
      teamspaceIds.map(async (teamspaceId) => {
        teamspaceAccess.set(
          teamspaceId,
          await resolveTeamspaceAccess(
            teamspaceId,
            workspaceId,
            userId,
            teamRows.map((row) => row.teamId),
          ),
        );
      }),
    );
  }

  for (const item of pages) {
    const ancestors = graph.getAncestorIds(item.id);

    if (
      (isMember &&
        item.teamspaceId &&
        hasAccess(teamspaceAccess.get(item.teamspaceId) ?? "none", "view")) ||
      (isMember && !item.teamspaceId && graph.hasOwnedRootAccess(ancestors, userId)) ||
      ancestors.some((id) => sharedRoots.has(id))
    ) {
      accessible.add(item.id);
    }
  }

  return accessible;
}

export async function getEffectiveTeamspaceAccessInWorkspace(
  teamspaceId: string,
  workspaceId: string,
  userId: string,
): Promise<AccessLevel> {
  const membership = await getMembership(workspaceId, userId);
  if (!membership) return "none";
  const teamIds = (
    await db
      .select({ teamId: teamMember.teamId })
      .from(teamMember)
      .where(eq(teamMember.userId, userId))
  ).map((row) => row.teamId);
  return resolveTeamspaceAccess(teamspaceId, workspaceId, userId, teamIds);
}

async function resolveTeamspaceAccess(
  teamspaceId: string,
  workspaceId: string,
  userId: string,
  teamIds: string[],
): Promise<AccessLevel> {
  const [record] = await db
    .select({
      archivedAt: teamspace.archivedAt,
      memberAccessLevel: teamspace.memberAccessLevel,
    })
    .from(teamspace)
    .where(and(eq(teamspace.id, teamspaceId), eq(teamspace.workspaceId, workspaceId)))
    .limit(1);
  if (!record || record.archivedAt) return "none";

  const { targetTypes, targetIds } = principalGrantTargets(userId, teamIds);
  const principals = await db
    .select({
      accessLevelOverride: teamspacePrincipal.accessLevelOverride,
      role: teamspacePrincipal.role,
    })
    .from(teamspacePrincipal)
    .where(
      and(
        eq(teamspacePrincipal.teamspaceId, teamspaceId),
        inArray(teamspacePrincipal.principalType, targetTypes),
        inArray(teamspacePrincipal.principalId, targetIds),
      ),
    );

  return teamspacePrincipalAccess(record.memberAccessLevel, principals);
}

export async function getEffectivePageAccessForUsers(
  pageId: string,
  workspaceId: string,
  userIds: string[],
) {
  const uniqueUserIds = [...new Set(userIds)];
  const accessByUserId = new Map<string, AccessLevel>();

  if (uniqueUserIds.length === 0) {
    return accessByUserId;
  }

  const [graph, teamRows] = await Promise.all([
    loadWorkspacePageGraph(workspaceId),
    db
      .select({
        teamId: teamMember.teamId,
        userId: teamMember.userId,
      })
      .from(teamMember)
      .where(inArray(teamMember.userId, uniqueUserIds)),
  ]);
  if (graph.getTeamspaceId?.(pageId)) {
    await Promise.all(
      uniqueUserIds.map(async (targetUserId) => {
        accessByUserId.set(
          targetUserId,
          await getEffectivePageAccessInWorkspace(pageId, workspaceId, targetUserId),
        );
      }),
    );
    return accessByUserId;
  }
  const ancestorIds = graph.getAncestorIds(pageId);

  if (ancestorIds.length === 0) {
    return accessByUserId;
  }

  const teamIdsByUserId = new Map<string, string[]>();

  for (const row of teamRows) {
    teamIdsByUserId.set(row.userId, [...(teamIdsByUserId.get(row.userId) ?? []), row.teamId]);
  }

  const teamIds = [...new Set(teamRows.map((row) => row.teamId))];
  const targetIds = [...uniqueUserIds, ...teamIds];
  const rules = await db
    .select({
      accessLevel: pageAccess.accessLevel,
      targetId: pageAccess.targetId,
      targetType: pageAccess.targetType,
    })
    .from(pageAccess)
    .where(
      and(
        eq(pageAccess.workspaceId, workspaceId),
        inArray(pageAccess.pageId, ancestorIds),
        inArray(pageAccess.targetType, ["user", "team"]),
        inArray(pageAccess.targetId, targetIds),
      ),
    );
  const accessByTarget = new Map<string, AccessLevel>();

  for (const rule of rules) {
    const key = `${rule.targetType}:${rule.targetId}`;
    const current = accessByTarget.get(key) ?? "none";
    const next = normalizeAccessLevel(rule.accessLevel) ?? "none";

    if (accessRank[next] > accessRank[current]) {
      accessByTarget.set(key, next);
    }
  }

  for (const userId of uniqueUserIds) {
    if (graph.hasOwnedRootAccess(ancestorIds, userId)) {
      accessByUserId.set(userId, "full");
      continue;
    }

    const targetKeys = [
      `user:${userId}`,
      ...(teamIdsByUserId.get(userId) ?? []).map((teamId) => `team:${teamId}`),
    ];
    const access = targetKeys.reduce<AccessLevel>((best, key) => {
      const next = accessByTarget.get(key) ?? "none";

      return accessRank[next] > accessRank[best] ? next : best;
    }, "none");

    accessByUserId.set(userId, access);
  }

  return accessByUserId;
}
