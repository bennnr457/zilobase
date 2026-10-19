import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { database, databaseRow, dataSource, page } from "../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../shared/config/config";
import { softDeletePageTree } from "../mutations/soft-delete-nav-items";
import type { PageRecord } from "../read/page-records";

export async function restorePage(existing: PageRecord) {
  if (!existing.deletedAt) {
    return {
      page: existing,
      restoredDatabaseIds: [],
      restoredPageIds: [],
    };
  }

  const deletedAt = existing.deletedAt;
  const { ...restored } = await db.transaction(async (tx) => {
    const now = new Date();
    const restoredPages = await tx
      .update(page)
      .set({
        deletedAt: null,
        deletedById: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(page.workspaceId, existing.workspaceId),
          eq(page.deletedAt, deletedAt),
          existing.deletedById ? eq(page.deletedById, existing.deletedById) : undefined,
        ),
      )
      .returning();
    const restoredDatabases = await tx
      .update(database)
      .set({
        deletedAt: null,
        deletedById: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(database.workspaceId, existing.workspaceId),
          eq(database.deletedAt, deletedAt),
          existing.deletedById ? eq(database.deletedById, existing.deletedById) : undefined,
        ),
      )
      .returning({ id: database.id });
    const restoredDatabaseIds = restoredDatabases.map((record) => record.id);

    if (restoredDatabaseIds.length > 0) {
      await tx
        .update(databaseRow)
        .set({
          deletedAt: null,
          deletedById: null,
          updatedAt: now,
        })
        .where(
          and(
            inArray(
              databaseRow.dataSourceId,
              tx
                .select({ id: dataSource.id })
                .from(dataSource)
                .where(inArray(dataSource.parentDatabaseId, restoredDatabaseIds)),
            ),
            eq(databaseRow.deletedAt, deletedAt),
            existing.deletedById ? eq(databaseRow.deletedById, existing.deletedById) : undefined,
          ),
        );
    }

    return {
      page: restoredPages.find((record) => record.id === existing.id) ?? existing,
      restoredDatabaseIds,
      restoredPageIds: restoredPages.map((record) => record.id),
    };
  });

  return restored;
}

export async function deletePage(existing: PageRecord, user: { id: string }, env: RuntimeEnv) {
  const { deletedDatabaseIds, deletedPageIds } = await softDeletePageTree({
    env: env,
    workspaceId: existing.workspaceId,
    rootPageId: existing.id,
    userId: user.id,
  });

  const [record] = await db.select().from(page).where(eq(page.id, existing.id)).limit(1);

  return {
    deletedDatabaseIds,
    deletedPageIds,
    page: record,
  };
}
