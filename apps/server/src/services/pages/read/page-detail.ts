import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import {
  database,
  databaseProperty,
  databaseRow,
  dataSource,
  favorite,
  pageItemPlacement,
  pageSettings,
  pageProperty,
} from "../../../infrastructure/database/schema";
import type { PagePropertyContext } from "@zilobase/features/runtime";
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
            .selectDistinct({
              databaseId: dataSource.parentDatabaseId,
              dataSourceId: dataSource.id,
              rowId: databaseRow.id,
              databaseVersion: database.version,
              sourceVersion: dataSource.version,
            })
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
  const accessibleMemberships = user
    ? (
        await Promise.all(
          databaseMemberships.map(async (membership) =>
            (await canAccessDatabaseInWorkspace(
              membership.databaseId,
              record.workspaceId,
              user.id,
              "view",
            ))
              ? membership
              : null,
          ),
        )
      ).filter((membership): membership is (typeof databaseMemberships)[number] =>
        Boolean(membership),
      )
    : [];
  const databaseIds = [
    ...new Set(accessibleMemberships.map((membership) => membership.databaseId)),
  ];
  const viewerType = usesPublishedFallback
    ? "public"
    : user && hasAccess(accessLevel, "view")
      ? await getWorkspacePrincipalKind(record.workspaceId, user.id)
      : "public";

  // Page access proves the metadata membership. This receipt contains no property
  // definitions or values; the client can reuse its already-authorized row reads.
  let propertyContext: PagePropertyContext | undefined;
  if (viewerType === "member") {
    const bindings = await db
      .select({ propertyId: pageProperty.id, dataSourceId: databaseRow.dataSourceId })
      .from(databaseRow)
      .innerJoin(databaseProperty, eq(databaseRow.dataSourceId, databaseProperty.dataSourceId))
      .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
      .where(
        and(
          eq(databaseRow.pageId, record.id),
          eq(pageProperty.workspaceId, record.workspaceId),
          isNull(databaseRow.deletedAt),
          isNull(pageProperty.deletedAt),
        ),
      )
      .orderBy(pageProperty.createdAt);
    propertyContext = {
      pageId: record.id,
      workspaceId: record.workspaceId,
      propertyIds: [...new Set(bindings.map((binding) => binding.propertyId))],
      databaseIds,
      databaseVersions: Object.fromEntries(
        accessibleMemberships.map((membership) => [
          membership.databaseId,
          membership.databaseVersion,
        ]),
      ),
      sourceVersions: Object.fromEntries(
        accessibleMemberships.map((membership) => [
          membership.dataSourceId,
          membership.sourceVersion,
        ]),
      ),
      presenceTargets: accessibleMemberships.map((membership) => ({
        databaseId: membership.databaseId,
        dataSourceId: membership.dataSourceId,
        rowId: membership.rowId,
        propertyIds: [
          ...new Set(
            bindings
              .filter((binding) => binding.dataSourceId === membership.dataSourceId)
              .map((binding) => binding.propertyId),
          ),
        ],
      })),
    };
  }

  return {
    accessLevel: hasAccess(accessLevel, "view") ? accessLevel : "view",
    databaseIds,
    viewerType,
    ...(propertyContext ? { propertyContext } : {}),
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
