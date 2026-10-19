import { and, asc, eq, getTableColumns, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import {
  database,
  databaseActorState,
  databaseDataSource,
  databaseRow,
  databaseView,
  dataSource,
  favorite,
  itemVisit,
  page,
  pageAccess,
  pageItemPlacement,
  user as userTable,
} from "../../../infrastructure/database/schema";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { canAccessDatabaseInWorkspace, getAccessiblePageIds } from "../../access/effective-access";
import { getMembership } from "../../access/principal-access";
import { withDatabaseReadSnapshot } from "../../databases/read/snapshot";
import { buildNavigationPlacements } from "../placements/page-item-placements";
export async function listWorkspacePages(
  workspaceId: string,
  userId: string,
  deletedOnly: boolean,
) {
  return withDatabaseReadSnapshot(async () => {
    if (!(await getMembership(workspaceId, userId))) {
      throw new ServiceMutationError("Forbidden", 403);
    }

    const deletedFilter = deletedOnly ? "only" : "active";
    const [accessibleIds, records] = await Promise.all([
      getAccessiblePageIds(workspaceId, userId, {
        membershipVerified: true,
      }),
      db
        .select({
          id: page.id,
          workspaceId: page.workspaceId,
          createdById: page.createdById,
          type: page.type,
          name: page.name,
          url: page.url,
          hasContent: page.hasContent,
          metadata: page.metadata,
          teamspaceId: page.teamspaceId,
          deletedById: page.deletedById,
          deletedAt: page.deletedAt,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
        })
        .from(page)
        .where(
          and(
            eq(page.workspaceId, workspaceId),
            deletedFilter === "only" ? undefined : isNull(page.deletedAt),
          ),
        ),
    ]);
    let accessibleRecords =
      deletedFilter === "only" ? records : records.filter((record) => accessibleIds.has(record.id));

    const [sharedPageRows, favoriteRows, visitRows, databaseRecords, placementRecords] =
      await Promise.all([
        db
          .select({ pageId: pageAccess.pageId })
          .from(pageAccess)
          .where(eq(pageAccess.workspaceId, workspaceId)),
        db
          .select({
            databaseId: favorite.databaseId,
            pageId: favorite.pageId,
          })
          .from(favorite)
          .where(eq(favorite.userId, userId)),
        db
          .select({
            itemId: itemVisit.itemId,
            itemKind: itemVisit.itemKind,
            lastVisitedAt: itemVisit.lastVisitedAt,
          })
          .from(itemVisit)
          .where(and(eq(itemVisit.workspaceId, workspaceId), eq(itemVisit.userId, userId))),
        db
          .select({
            ...getTableColumns(database),
            // One statement observes the private favorite and its revision together.
            // Keep the outer table as an explicit SQL identifier: select-field
            // normalization strips PgColumn qualifiers in single-table queries.
            favoriteValue: sql<boolean>`exists (select 1 from ${favorite} where ${favorite.databaseId} = ${database}.${sql.identifier("id")} and ${favorite.userId} = ${userId})`,
            actorRevision:
              sql<number>`coalesce((select ${databaseActorState.revision} from ${databaseActorState} where ${databaseActorState.databaseId} = ${database}.${sql.identifier("id")} and ${databaseActorState.actorId} = ${userId}), 0)`.mapWith(
                Number,
              ),
          })
          .from(database)
          .where(
            and(
              eq(database.workspaceId, workspaceId),
              deletedFilter === "only" ? isNotNull(database.deletedAt) : isNull(database.deletedAt),
            ),
          ),
        db
          .select()
          .from(pageItemPlacement)
          .where(
            and(
              eq(pageItemPlacement.workspaceId, workspaceId),
              isNull(pageItemPlacement.deletedAt),
            ),
          ),
      ]);

    const standaloneDatabaseRecords = (
      await Promise.all(
        databaseRecords
          .filter((record) => !record.pageId)
          .map(async (record) => ({
            record,
            visible:
              deletedFilter === "only"
                ? Boolean(record.deletedAt)
                : await canAccessDatabaseInWorkspace(record.id, record.workspaceId, userId, "view"),
          })),
      )
    ).filter(({ visible }) => visible);
    const standaloneDatabaseIds = new Set(standaloneDatabaseRecords.map(({ record }) => record.id));
    const navigationDatabaseRecords = databaseRecords.filter(
      (record) => Boolean(record.pageId) || standaloneDatabaseIds.has(record.id),
    );

    if (deletedFilter === "only") {
      const accessibleRecordIds = new Set(accessibleRecords.map((record) => record.id));
      const missingDatabaseHostPageIds = [
        ...new Set(
          navigationDatabaseRecords
            .map((record) => record.pageId)
            .filter((pageId): pageId is string =>
              Boolean(pageId && !accessibleRecordIds.has(pageId)),
            ),
        ),
      ];

      if (missingDatabaseHostPageIds.length > 0) {
        const databaseHostPages = await db
          .select({
            id: page.id,
            workspaceId: page.workspaceId,
            createdById: page.createdById,
            type: page.type,
            name: page.name,
            url: page.url,
            hasContent: page.hasContent,
            metadata: page.metadata,
            teamspaceId: page.teamspaceId,
            deletedById: page.deletedById,
            deletedAt: page.deletedAt,
            createdAt: page.createdAt,
            updatedAt: page.updatedAt,
          })
          .from(page)
          .where(
            and(eq(page.workspaceId, workspaceId), inArray(page.id, missingDatabaseHostPageIds)),
          );

        accessibleRecords = [...accessibleRecords, ...databaseHostPages];
      }
    }

    const sharedPageIds = new Set(sharedPageRows.map((row) => row.pageId));
    const favoritePageIds = new Set(
      favoriteRows.map((row) => row.pageId).filter((pageId): pageId is string => Boolean(pageId)),
    );
    const visitsByKey = new Map(
      visitRows.map((visit) => [`${visit.itemKind}:${visit.itemId}`, visit.lastVisitedAt]),
    );

    const accessibleRecordIds = new Set(accessibleRecords.map((record) => record.id));
    const activeDatabases = navigationDatabaseRecords.filter((record) =>
      record.pageId ? accessibleRecordIds.has(record.pageId) : standaloneDatabaseIds.has(record.id),
    );
    const activeDatabaseIds = new Set(activeDatabases.map((record) => record.id));
    const databaseRowPages =
      activeDatabaseIds.size > 0
        ? await db
            .select({
              databaseId: dataSource.parentDatabaseId,
              id: databaseRow.id,
              pageId: databaseRow.pageId,
            })
            .from(databaseRow)
            .innerJoin(dataSource, eq(databaseRow.dataSourceId, dataSource.id))
            .where(
              and(
                inArray(dataSource.parentDatabaseId, [...activeDatabaseIds]),
                isNull(databaseRow.deletedAt),
              ),
            )
        : [];
    const missingDatabaseRowPageIds = [
      ...new Set(
        databaseRowPages
          .map((row) => row.pageId)
          .filter((pageId) => !accessibleRecordIds.has(pageId)),
      ),
    ];

    if (deletedFilter === "active" && missingDatabaseRowPageIds.length > 0) {
      const deletedDatabaseRowPages = await db
        .select({
          id: page.id,
          workspaceId: page.workspaceId,
          createdById: page.createdById,
          type: page.type,
          name: page.name,
          url: page.url,
          hasContent: page.hasContent,
          metadata: page.metadata,
          teamspaceId: page.teamspaceId,
          deletedById: page.deletedById,
          deletedAt: page.deletedAt,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
        })
        .from(page)
        .where(
          and(
            eq(page.workspaceId, workspaceId),
            inArray(page.id, missingDatabaseRowPageIds),
            isNotNull(page.deletedAt),
          ),
        );

      accessibleRecords = [...accessibleRecords, ...deletedDatabaseRowPages];

      for (const record of deletedDatabaseRowPages) {
        accessibleRecordIds.add(record.id);
      }
    }

    const creatorIds = [
      ...new Set(
        [
          ...accessibleRecords.flatMap((record) => [record.createdById, record.deletedById]),
          ...activeDatabases.map((record) => record.deletedById),
          ...activeDatabases.map((record) => record.createdById),
        ].filter((createdById): createdById is string => Boolean(createdById)),
      ),
    ];
    const [creatorRows, databaseViews, databaseSourceLinks] = await Promise.all([
      creatorIds.length > 0
        ? db
            .select({
              email: userTable.email,
              id: userTable.id,
              image: userTable.image,
              name: userTable.name,
            })
            .from(userTable)
            .where(inArray(userTable.id, creatorIds))
        : Promise.resolve([]),
      activeDatabaseIds.size > 0
        ? db
            .select({
              config: databaseView.config,
              createdAt: databaseView.createdAt,
              dataSourceId: databaseView.dataSourceId,
              databaseId: databaseView.databaseId,
              id: databaseView.id,
              name: databaseView.name,
              position: databaseView.position,
              type: databaseView.type,
              updatedAt: databaseView.updatedAt,
            })
            .from(databaseView)
            .where(inArray(databaseView.databaseId, [...activeDatabaseIds]))
        : Promise.resolve([]),
      activeDatabaseIds.size > 0
        ? db
            .select({
              ...getTableColumns(dataSource),
              linkedAt: databaseDataSource.createdAt,
              databaseId: databaseDataSource.databaseId,
              parentDatabaseId: dataSource.parentDatabaseId,
              position: databaseDataSource.position,
            })
            .from(databaseDataSource)
            .innerJoin(dataSource, eq(databaseDataSource.dataSourceId, dataSource.id))
            .where(
              and(
                inArray(databaseDataSource.databaseId, [...activeDatabaseIds]),
                isNull(dataSource.deletedAt),
              ),
            )
            .orderBy(asc(databaseDataSource.position))
        : Promise.resolve([]),
    ]);
    // A host link does not grant access to a foreign source's owning database.
    const sourcePermissions = await Promise.all(
      databaseSourceLinks.map(
        (link) =>
          link.parentDatabaseId === link.databaseId ||
          canAccessDatabaseInWorkspace(link.parentDatabaseId, workspaceId, userId, "view"),
      ),
    );
    const authorizedSourceLinks = databaseSourceLinks.filter(
      (_, index) => sourcePermissions[index],
    );
    const creatorsById = new Map(creatorRows.map((creator) => [creator.id, creator]));
    const createdByByPageId = new Map(
      accessibleRecords.map((record) => [
        record.id,
        record.createdById ? (creatorsById.get(record.createdById) ?? null) : null,
      ]),
    );

    const viewsByDatabaseId = new Map<string, typeof databaseViews>();

    for (const view of databaseViews) {
      viewsByDatabaseId.set(view.databaseId, [
        ...(viewsByDatabaseId.get(view.databaseId) ?? []),
        view,
      ]);
    }
    const primarySourceByDatabaseId = new Map<string, (typeof databaseSourceLinks)[number]>();

    for (const sourceLink of authorizedSourceLinks) {
      const current = primarySourceByDatabaseId.get(sourceLink.databaseId);
      const isOwned = sourceLink.parentDatabaseId === sourceLink.databaseId;
      const currentIsOwned = current?.parentDatabaseId === current?.databaseId;

      if (!current || (isOwned && !currentIsOwned)) {
        primarySourceByDatabaseId.set(sourceLink.databaseId, sourceLink);
      }
    }
    type ActiveDatabasePayload = Omit<
      (typeof activeDatabases)[number],
      "actorRevision" | "favoriteValue"
    > & {
      actorState: { actorId: string; revision: number; isFavorite: boolean };
      createdBy: (typeof creatorRows)[number] | null;
      dataSourceConfig: unknown;
      metadataState: { version: number; primarySource: { id: string; version: number } | null };
      deletedBy: (typeof creatorRows)[number] | null;
      isFavorite: boolean;
      lastVisitedAt: Date | null;
      views: typeof databaseViews;
      dataSources: unknown[];
    };
    const databasePayloads: ActiveDatabasePayload[] = [];

    for (const record of activeDatabases) {
      const { actorRevision, favoriteValue, ...publicRecord } = record;
      const links = authorizedSourceLinks.filter((link) => link.databaseId === record.id);
      const sourceIds = new Set(links.map((link) => link.id));
      const views = [...(viewsByDatabaseId.get(record.id) ?? [])]
        .filter((view) => sourceIds.has(view.dataSourceId))
        .sort((first, second) => first.position - second.position);

      databasePayloads.push({
        ...publicRecord,
        dataSources: links.map((link) => ({
          id: link.id,
          workspaceId: link.workspaceId,
          parentDatabaseId: link.parentDatabaseId,
          name: link.name,
          config: link.config,
          configVersion: link.configVersion,
          version: link.version,
          createdAt: link.createdAt,
          updatedAt: link.updatedAt,
          linkedAt: link.linkedAt,
          position: link.position,
        })),
        metadataState: {
          version: record.version,
          primarySource: primarySourceByDatabaseId.has(record.id)
            ? {
                id: primarySourceByDatabaseId.get(record.id)!.id,
                version: primarySourceByDatabaseId.get(record.id)!.version,
              }
            : null,
        },
        actorState: { actorId: userId, revision: actorRevision, isFavorite: favoriteValue },
        createdBy: record.createdById ? (creatorsById.get(record.createdById) ?? null) : null,
        deletedBy: record.deletedById ? (creatorsById.get(record.deletedById) ?? null) : null,
        isFavorite: favoriteValue,
        lastVisitedAt: visitsByKey.get(`database:${record.id}`) ?? null,
        dataSourceConfig: primarySourceByDatabaseId.get(record.id)?.config ?? null,
        views,
      });
    }
    const placements = buildNavigationPlacements({
      placementRecords,
      visibleDatabaseIds: activeDatabaseIds,
    });

    return {
      databases: databasePayloads,
      placements,
      pages: accessibleRecords.map((record) => ({
        ...record,
        createdBy: record.createdById ? (creatorsById.get(record.createdById) ?? null) : null,
        deletedBy: record.deletedById ? (creatorsById.get(record.deletedById) ?? null) : null,
        isFavorite: favoritePageIds.has(record.id),
        isShared: sharedPageIds.has(record.id),
        lastVisitedAt: visitsByKey.get(`page:${record.id}`) ?? null,
      })),
    };
  });
}
