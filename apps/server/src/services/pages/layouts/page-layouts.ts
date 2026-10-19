import {
  createDefaultPageLayout,
  normalizePageLayoutConfig,
  toWorkspacePageLayout,
  type PageLayoutConfig,
  type PageLayoutScope,
} from "@zilobase/features/runtime";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import {
  dataSource,
  database,
  databaseRow,
  page,
  pageLayout,
} from "../../../infrastructure/database/schema";
import {
  canAccessDatabaseInWorkspace,
  canAccessPageInWorkspace,
  isDatabasePublishedInWorkspace,
  isPagePublishedInWorkspace,
} from "../../access/effective-access";
import { getMembership, isPrivilegedOrgRole } from "../../access/principal-access";
export type PageLayoutWriteInput = {
  config: PageLayoutConfig;
  scope: PageLayoutScope;
  scopeId: string;
  workspaceId: string;
};

export type PageLayoutWriter = Pick<typeof db, "delete" | "insert" | "select">;

export async function upsertPageLayout(
  writer: Pick<PageLayoutWriter, "insert">,
  input: PageLayoutWriteInput,
) {
  return writer
    .insert(pageLayout)
    .values({
      config: input.config,
      id: crypto.randomUUID(),
      scopeId: input.scopeId,
      scopeType: input.scope,
      workspaceId: input.workspaceId,
    })
    .onConflictDoUpdate({
      target: [pageLayout.scopeType, pageLayout.scopeId],
      set: {
        config: input.config,
        updatedAt: new Date(),
        workspaceId: input.workspaceId,
      },
    })
    .returning();
}

export async function deleteDatabasePageOverrides(
  writer: Pick<PageLayoutWriter, "delete" | "select">,
  databaseId: string,
) {
  const databasePageIds = writer
    .select({ pageId: databaseRow.pageId })
    .from(databaseRow)
    .where(
      and(
        inArray(
          databaseRow.dataSourceId,
          writer
            .select({ id: dataSource.id })
            .from(dataSource)
            .where(eq(dataSource.parentDatabaseId, databaseId)),
        ),
        isNull(databaseRow.deletedAt),
      ),
    );

  await writer
    .delete(pageLayout)
    .where(and(eq(pageLayout.scopeType, "page"), inArray(pageLayout.scopeId, databasePageIds)));
}

export async function getTargetContext(input: {
  databaseId?: string | null;
  pageId?: string | null;
}) {
  if (input.databaseId) {
    const [record] = await db
      .select()
      .from(database)
      .where(and(eq(database.id, input.databaseId), isNull(database.deletedAt)))
      .limit(1);

    if (!record) return null;

    const [firstRow] = await db
      .select({ pageId: databaseRow.pageId })
      .from(databaseRow)
      .innerJoin(dataSource, eq(dataSource.id, databaseRow.dataSourceId))
      .where(and(eq(dataSource.parentDatabaseId, record.id), isNull(databaseRow.deletedAt)))
      .orderBy(asc(databaseRow.orderKey), asc(databaseRow.id))
      .limit(1);

    return {
      databaseId: record.id,
      pageId: firstRow?.pageId ?? null,
      workspaceId: record.workspaceId,
    };
  }

  if (!input.pageId) return null;

  const [record] = await db
    .select()
    .from(page)
    .where(and(eq(page.id, input.pageId), isNull(page.deletedAt)))
    .limit(1);

  if (!record) return null;

  const [row] = await db
    .select({ databaseId: dataSource.parentDatabaseId })
    .from(databaseRow)
    .innerJoin(dataSource, eq(dataSource.id, databaseRow.dataSourceId))
    .innerJoin(database, eq(database.id, dataSource.parentDatabaseId))
    .where(
      and(
        eq(databaseRow.pageId, record.id),
        isNull(databaseRow.deletedAt),
        isNull(database.deletedAt),
      ),
    )
    .orderBy(asc(databaseRow.orderKey), asc(databaseRow.id))
    .limit(1);

  return {
    databaseId: row?.databaseId ?? null,
    pageId: record.id,
    workspaceId: record.workspaceId,
  };
}

export async function canViewTarget(
  context: NonNullable<Awaited<ReturnType<typeof getTargetContext>>>,
  userId?: string | null,
) {
  if (userId) {
    return context.pageId
      ? canAccessPageInWorkspace(context.pageId, context.workspaceId, userId, "view")
      : context.databaseId
        ? canAccessDatabaseInWorkspace(context.databaseId, context.workspaceId, userId, "view")
        : false;
  }

  return context.pageId
    ? isPagePublishedInWorkspace(context.pageId, context.workspaceId)
    : context.databaseId
      ? isDatabasePublishedInWorkspace(context.databaseId, context.workspaceId)
      : false;
}

export async function resolveScopeContext(scope: PageLayoutScope, scopeId: string) {
  if (scope === "workspace") {
    return { workspaceId: scopeId };
  }
  if (scope === "database") {
    const [record] = await db.select().from(database).where(eq(database.id, scopeId)).limit(1);
    return record ? { workspaceId: record.workspaceId } : null;
  }
  const [record] = await db.select().from(page).where(eq(page.id, scopeId)).limit(1);
  return record ? { workspaceId: record.workspaceId } : null;
}

export async function canEditScope(
  scope: PageLayoutScope,
  scopeId: string,
  workspaceId: string,
  userId: string,
) {
  if (scope === "workspace") {
    const membership = await getMembership(workspaceId, userId);
    return Boolean(membership && isPrivilegedOrgRole(membership.role));
  }
  return scope === "database"
    ? canAccessDatabaseInWorkspace(scopeId, workspaceId, userId, "edit")
    : canAccessPageInWorkspace(scopeId, workspaceId, userId, "edit");
}

export async function resolvePageLayouts(
  context: NonNullable<Awaited<ReturnType<typeof getTargetContext>>>,
) {
  const scopeIds = [context.workspaceId, context.databaseId, context.pageId].filter(
    (id): id is string => Boolean(id),
  );
  const layouts = await db
    .select()
    .from(pageLayout)
    .where(
      and(eq(pageLayout.workspaceId, context.workspaceId), inArray(pageLayout.scopeId, scopeIds)),
    );

  const byScope = new Map(layouts.map((layout) => [layout.scopeType, layout]));
  let config = createDefaultPageLayout({ database: Boolean(context.databaseId) });
  const sources: Partial<Record<"generic" | "schema", PageLayoutScope>> = {};

  for (const scope of ["workspace", "database", "page"] as const) {
    const stored = byScope.get(scope);
    if (!stored) continue;
    config = normalizePageLayoutConfig(stored.config, { database: Boolean(context.databaseId) });
    sources.generic = scope;
    if (scope !== "workspace") sources.schema = scope;
  }

  return {
    config,
    databaseId: context.databaseId,
    pageId: context.pageId,
    sources,
    workspaceId: context.workspaceId,
  };
}

export async function savePageLayout(
  scope: PageLayoutScope,
  scopeId: string,
  context: { workspaceId: string },
  input: { config: unknown; clearPageOverrides?: boolean },
) {
  let config: PageLayoutConfig = normalizePageLayoutConfig(input.config, {
    database: scope === "database",
  });
  if (scope === "workspace") config = toWorkspacePageLayout(config);

  const saveInput = {
    config,
    scope,
    scopeId,
    workspaceId: context.workspaceId,
  };
  const shouldClearPageOverrides = scope === "database" && input.clearPageOverrides === true;

  if (!shouldClearPageOverrides) {
    const [saved] = await upsertPageLayout(db, saveInput);
    return { layout: saved };
  }

  const [saved] = await db.transaction(async (tx) => {
    const savedLayouts = await upsertPageLayout(tx, saveInput);
    await deleteDatabasePageOverrides(tx, scopeId);

    return savedLayouts;
  });

  return { layout: saved };
}

export async function deletePageLayout(scope: PageLayoutScope, scopeId: string) {
  await db
    .delete(pageLayout)
    .where(and(eq(pageLayout.scopeType, scope), eq(pageLayout.scopeId, scopeId)));
}
