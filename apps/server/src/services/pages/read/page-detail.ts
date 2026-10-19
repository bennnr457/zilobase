import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import {
  database,
  databaseRow,
  dataSource,
  favorite,
  pageItemPlacement,
  pageSettings,
} from "../../../infrastructure/database/schema";
import { hasAccess, type AccessLevel } from "../../access/access-level";
import { canAccessDatabaseInWorkspace } from "../../access/effective-access";
import { getWorkspacePrincipalKind } from "../../access/principal-access";
import type { PageRecord } from "./page-records";
export async function getPageDetail(
  record: PageRecord,
  user: { id: string } | null,
  accessLevel: AccessLevel,
  usesPublishedFallback: boolean,
) {
  const [favoriteRecords, parentPlacements, ownerSettingsRecords, databaseMemberships] =
    await Promise.all([
      user
        ? db
            .select({ id: favorite.id })
            .from(favorite)
            .where(and(eq(favorite.userId, user.id), eq(favorite.pageId, record.id)))
            .limit(1)
        : Promise.resolve([]),
      db
        .select({ parentId: pageItemPlacement.parentId })
        .from(pageItemPlacement)
        .where(
          and(
            eq(pageItemPlacement.workspaceId, record.workspaceId),
            eq(pageItemPlacement.itemKind, "page"),
            eq(pageItemPlacement.itemId, record.id),
            eq(pageItemPlacement.placementKind, "primary"),
            isNull(pageItemPlacement.deletedAt),
          ),
        )
        .limit(1),
      usesPublishedFallback && record.createdById
        ? db
            .select({ pageFullWidth: pageSettings.pageFullWidth })
            .from(pageSettings)
            .where(eq(pageSettings.userId, record.createdById))
            .limit(1)
        : Promise.resolve([]),
      user && hasAccess(accessLevel, "view")
        ? db
            .selectDistinct({ databaseId: dataSource.parentDatabaseId })
            .from(databaseRow)
            .innerJoin(dataSource, eq(databaseRow.dataSourceId, dataSource.id))
            .innerJoin(database, eq(dataSource.parentDatabaseId, database.id))
            .where(
              and(
                eq(databaseRow.pageId, record.id),
                isNull(databaseRow.deletedAt),
                isNull(database.deletedAt),
              ),
            )
        : Promise.resolve([]),
    ]);
  const [favoriteRecord] = favoriteRecords;
  const [parentPlacement] = parentPlacements;
  const [ownerSettings] = ownerSettingsRecords;
  const databaseIds = user
    ? (
        await Promise.all(
          databaseMemberships.map(async ({ databaseId }) =>
            (await canAccessDatabaseInWorkspace(databaseId, record.workspaceId, user.id, "view"))
              ? databaseId
              : null,
          ),
        )
      ).filter((databaseId): databaseId is string => Boolean(databaseId))
    : [];
  const viewerType = usesPublishedFallback
    ? "public"
    : user && hasAccess(accessLevel, "view")
      ? await getWorkspacePrincipalKind(record.workspaceId, user.id)
      : "public";

  return {
    accessLevel: hasAccess(accessLevel, "view") ? accessLevel : "view",
    databaseIds,
    viewerType,
    page: {
      ...record,
      publishedOwnerPreferences: usesPublishedFallback
        ? { pageFullWidth: ownerSettings?.pageFullWidth ?? false }
        : null,
      isFavorite: Boolean(favoriteRecord),
      parentPageId: parentPlacement?.parentId ?? null,
    },
  };
}
