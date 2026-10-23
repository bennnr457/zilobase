import {
  clonePageContent,
  getDuplicatePageName,
  hasPageBodyContent,
  isReadOnlyPropertyType,
  type DatabaseCommand,
} from "@zilobase/features/runtime";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import {
  database,
  databaseProperty,
  databaseRow,
  page,
  pageCollaborationDocument,
  pageItemPlacement,
  pageProperty,
} from "../../../infrastructure/database/schema";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { canAccessPageInWorkspace } from "../../access/effective-access";
import { encodePageContentAsYjs } from "../../collaboration/documents/document-codec";
import { upsertPageItemPlacement } from "../../pages/placements/page-item-placements";
import { ensureCommandSourceLock } from "./framework";
import type { DatabaseCommandContext } from "./framework";
import { getDatabaseRecordEntity } from "./record-entity";
import { createRow, setRowArchived } from "./records";

export async function authorizeRecordAction(
  command: DatabaseCommand,
  dataSourceId: string,
  workspaceId: string,
  actorId: string,
) {
  if (command.type !== "row.duplicate" && command.type !== "row.moveToPage") return;
  // Archived membership remains identifiable so an authorized receipt can be replayed.
  const [record] = await db
    .select({ pageId: databaseRow.pageId })
    .from(databaseRow)
    .where(and(eq(databaseRow.id, command.rowId), eq(databaseRow.dataSourceId, dataSourceId)))
    .limit(1);
  if (!record) throw new ServiceMutationError("Row not found", 404);
  if (!(await canAccessPageInWorkspace(record.pageId, workspaceId, actorId, "edit")))
    throw new ServiceMutationError("Forbidden", 403);
  if (
    command.type === "row.moveToPage" &&
    !(await canAccessPageInWorkspace(command.pageId, workspaceId, actorId, "edit"))
  )
    throw new ServiceMutationError("Forbidden", 403);
  if (command.type === "row.moveToPage") {
    const pages = await db
      .select({ id: page.id, teamspaceId: page.teamspaceId })
      .from(page)
      .where(inArray(page.id, [record.pageId, command.pageId]));
    const origin = pages.find((item) => item.id === record.pageId);
    const destination = pages.find((item) => item.id === command.pageId);
    if (
      origin &&
      destination &&
      origin.teamspaceId !== destination.teamspaceId &&
      !(await canAccessPageInWorkspace(record.pageId, workspaceId, actorId, "full"))
    )
      throw new ServiceMutationError("Full access is required to move across teamspaces", 403);
  }
}

export async function dispatchRecordActionCommand(
  context: DatabaseCommandContext,
  command: DatabaseCommand,
) {
  if (command.type !== "row.duplicate" && command.type !== "row.moveToPage") return null;
  const sourceId = context.dataSourceId!;
  await ensureCommandSourceLock(context, sourceId);
  const [row] = await context.transaction
    .select()
    .from(databaseRow)
    .where(
      and(
        eq(databaseRow.id, command.rowId),
        eq(databaseRow.dataSourceId, sourceId),
        isNull(databaseRow.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new ServiceMutationError("Row not found", 404);
  const [original] = await context.transaction
    .select()
    .from(page)
    .where(and(eq(page.id, row.pageId), isNull(page.deletedAt)))
    .limit(1);
  if (!original) throw new ServiceMutationError("Page not found", 404);
  const now = new Date();
  if (command.type === "row.duplicate") {
    const current = await getDatabaseRecordEntity(context.transaction, sourceId, row.id);
    const definitions = await context.transaction
      .select({ id: pageProperty.id, type: pageProperty.type, config: pageProperty.config })
      .from(databaseProperty)
      .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
      .where(and(eq(databaseProperty.dataSourceId, sourceId), isNull(pageProperty.deletedAt)));
    const structuralRole = (config: unknown) =>
      config && typeof config === "object" && "subItems" in config
        ? (config as { subItems?: { role?: string } }).subItems?.role
        : undefined;
    const parentProperty = definitions.find(
      (property) => structuralRole(property.config) === "parent-item",
    );
    const childrenProperty = definitions.find(
      (property) => structuralRole(property.config) === "sub-item",
    );
    const stored = new Set(
      definitions
        .filter(
          (property) =>
            !isReadOnlyPropertyType(property.type) &&
            !["formula", "rollup", "id", "button"].includes(property.type) &&
            !structuralRole(property.config),
        )
        .map((property) => property.id),
    );
    const parentRowId = command.parentRowId === undefined ? row.parentRowId : command.parentRowId;
    const id = crypto.randomUUID();
    const content = clonePageContent(original.content);
    await context.transaction.insert(page).values({
      id,
      workspaceId: original.workspaceId,
      teamspaceId: original.teamspaceId,
      name: getDuplicatePageName(original.name),
      type: original.type,
      url: original.url,
      content,
      metadata: original.metadata,
      hasContent: hasPageBodyContent(content),
      createdById: context.actorId,
      createdAt: now,
      updatedAt: now,
    });
    await context.transaction
      .insert(pageCollaborationDocument)
      .values({ pageId: id, state: Buffer.from(encodePageContentAsYjs(content)), updatedAt: now });
    return createRow(context, {
      type: "row.place",
      afterRowId: row.id,
      beforeRowId: null,
      pageId: id,
      parentRowId,
      ...(parentProperty && childrenProperty
        ? {
            hierarchy: {
              parentRowId,
              parentPropertyId: parentProperty.id,
              subItemPropertyId: childrenProperty.id,
            },
          }
        : {}),
      valuesByPropertyId: Object.fromEntries(
        Object.entries(current.valuesByPropertyId)
          .filter(([propertyId]) => stored.has(propertyId))
          .map(([propertyId, value]) => [propertyId, value.value]),
      ),
    });
  }
  const [destination] = await context.transaction
    .select()
    .from(page)
    .where(
      and(
        eq(page.id, command.pageId),
        eq(page.workspaceId, original.workspaceId),
        isNull(page.deletedAt),
      ),
    )
    .limit(1);
  if (!destination) throw new ServiceMutationError("Destination not found", 404);
  await context.transaction.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`page-hierarchy:${original.workspaceId}`}))`,
  );
  // Walk page and database-row placements so nesting through an embedded database cannot form a cycle.
  const placements = await context.transaction
    .select()
    .from(pageItemPlacement)
    .where(
      and(
        eq(pageItemPlacement.workspaceId, original.workspaceId),
        isNull(pageItemPlacement.deletedAt),
      ),
    );
  const ancestors = new Set<string>([destination.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const placement of placements) {
      if (placement.placementKind === "linked") continue;
      if (ancestors.has(placement.itemId) && !ancestors.has(placement.parentId)) {
        ancestors.add(placement.parentId);
        changed = true;
      }
    }
  }
  if (ancestors.has(original.id))
    throw new ServiceMutationError("Moving would create a cycle", 409);
  const descendants = new Set([original.id]);
  changed = true;
  while (changed) {
    changed = false;
    for (const placement of placements) {
      if (
        placement.placementKind !== "linked" &&
        descendants.has(placement.parentId) &&
        !descendants.has(placement.itemId)
      ) {
        descendants.add(placement.itemId);
        changed = true;
      }
    }
  }
  await context.transaction
    .update(page)
    .set({ teamspaceId: destination.teamspaceId, updatedAt: now })
    .where(and(inArray(page.id, [...descendants]), eq(page.workspaceId, original.workspaceId)));
  await context.transaction
    .update(database)
    .set({ teamspaceId: destination.teamspaceId, updatedAt: now })
    .where(
      and(
        inArray(database.pageId, [...descendants]),
        eq(database.workspaceId, original.workspaceId),
      ),
    );
  const result = await setRowArchived(context, { type: "row.archive", rowId: row.id });
  await context.transaction
    .update(pageItemPlacement)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(pageItemPlacement.itemId, original.id),
        eq(pageItemPlacement.itemKind, "page"),
        eq(pageItemPlacement.placementKind, "primary"),
        isNull(pageItemPlacement.deletedAt),
      ),
    );
  await upsertPageItemPlacement(context.transaction, {
    workspaceId: original.workspaceId,
    itemId: original.id,
    itemKind: "page",
    parentId: destination.id,
    parentKind: "page",
    placementKind: "primary",
  });
  return result;
}
