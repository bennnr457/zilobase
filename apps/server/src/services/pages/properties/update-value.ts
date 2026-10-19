import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import {
  database,
  databaseProperty,
  databaseRow,
  dataSource,
  page,
  pageProperty,
  pagePropertyValue,
} from "../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../shared/config/config";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { canAccessDatabaseInWorkspace } from "../../access/effective-access";
import { lockDatabaseAutomationFactRows } from "../../automations/triggers/event-capture";
import { getDatabaseRecordEntity } from "../../databases/commands/record-entity";
import { commitDatabaseMutationBatch } from "../../databases/mutations/commit";
import type { PageRecord } from "../read/page-records";
export async function updatePageProperty(
  record: PageRecord,
  user: { id: string },
  propertyId: string,
  value: unknown,
  env: RuntimeEnv,
  apiKey: boolean,
) {
  const candidateMemberships = await db
    .select({
      databaseId: dataSource.parentDatabaseId,
      dataSourceId: dataSource.id,
      property: pageProperty,
      rowId: databaseRow.id,
    })
    .from(databaseRow)
    .innerJoin(
      databaseProperty,
      and(
        eq(databaseProperty.dataSourceId, databaseRow.dataSourceId),
        eq(databaseProperty.propertyId, propertyId),
      ),
    )
    .innerJoin(pageProperty, eq(pageProperty.id, databaseProperty.propertyId))
    .innerJoin(dataSource, eq(dataSource.id, databaseRow.dataSourceId))
    .innerJoin(database, eq(database.id, dataSource.parentDatabaseId))
    .where(
      and(
        eq(databaseRow.pageId, record.id),
        eq(pageProperty.workspaceId, record.workspaceId),
        isNull(databaseRow.deletedAt),
        isNull(database.deletedAt),
        isNull(pageProperty.deletedAt),
      ),
    );
  const accessibleDatabaseIds = new Set(
    (
      await Promise.all(
        [...new Set(candidateMemberships.map(({ databaseId }) => databaseId))].map(
          async (databaseId) =>
            (await canAccessDatabaseInWorkspace(databaseId, record.workspaceId, user.id, "view"))
              ? databaseId
              : null,
        ),
      )
    ).filter((databaseId): databaseId is string => Boolean(databaseId)),
  );
  const memberships = candidateMemberships.filter(({ databaseId }) =>
    accessibleDatabaseIds.has(databaseId),
  );

  if (memberships.length === 0) {
    throw new ServiceMutationError("Property not found", 404);
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const { commits } = await commitDatabaseMutationBatch(
    { actorId: user.id, env: env },
    async (tx) => {
      await lockDatabaseAutomationFactRows(
        tx,
        memberships.map(({ dataSourceId, rowId }) => ({ dataSourceId, rowId })),
      );
      const [previousValue] = await tx
        .select({ value: pagePropertyValue.value })
        .from(pagePropertyValue)
        .where(
          and(
            eq(pagePropertyValue.pageId, record.id),
            eq(pagePropertyValue.propertyId, propertyId),
          ),
        )
        .limit(1);
      const [savedValue] = await tx
        .insert(pagePropertyValue)
        .values({
          id: crypto.randomUUID(),
          pageId: record.id,
          propertyId,
          value,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [pagePropertyValue.pageId, pagePropertyValue.propertyId],
          set: { value, updatedAt: now },
        })
        .returning();

      if (!savedValue) {
        throw new Error("Failed to save page property value");
      }

      await tx
        .update(databaseRow)
        .set({ lastEditedById: user.id, updatedAt: now })
        .where(
          inArray(
            databaseRow.id,
            memberships.map(({ rowId }) => rowId),
          ),
        );
      await tx.update(page).set({ updatedAt: now }).where(eq(page.id, record.id));

      return {
        automationFacts: memberships.map(({ dataSourceId, rowId }) => ({
          actorId: user.id,
          changedValues: [
            {
              after: value,
              before: previousValue?.value ?? null,
              propertyId,
            },
          ],
          dataSourceId,
          origin: apiKey ? ("api" as const) : ("user" as const),
          pageId: record.id,
          rowId,
        })),
        mutations: await Promise.all(
          memberships.map(async ({ databaseId, dataSourceId, rowId }) => ({
            areas: ["records" as const],
            changes: { records: [await getDatabaseRecordEntity(tx, dataSourceId, rowId)] },
            databaseId,
            dataSourceId,
          })),
        ),
        result: undefined,
      };
    },
  );

  return { events: commits };
}
