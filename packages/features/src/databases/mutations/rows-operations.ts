import {
  clientDatabaseController,
  type ClientOperationContext,
} from "../../shared/operation-context";
import { clientMutation, runClientMutation } from "../../shared/operation-mutation";

import type { ChangeRowCommand, DatabaseRecordEntity } from "../core/entities";
import { changeRecordHierarchy } from "../interactions/hierarchy";
import type { RecordEffect } from "../interactions/model";
import { submitRecordChange } from "../interactions/record-change";
import { previewTransferredValues } from "../interactions/transfer";
import { findDataSourceBootstrap, resolveDataSourceCommandScope } from "./scope";

export type AddRowInput = {
  clearSortViewId?: string;
  afterRowId?: string | null;
  beforeRowId?: string | null;
  databaseId: string;
  hostDatabaseId?: string;
  hierarchy?: ChangeRowCommand["hierarchy"];
  initialValues?: Array<{ propertyId: string; value: unknown }>;
  pageId?: string;
  previewTitle?: string;
  parentRowId?: string | null;
  position?: number;
  sourceDataSourceId?: string;
  sourceHostDatabaseId?: string;
  sourcePropertyMode?: "duplicate" | "match";
  sourceRowId?: string;
  title?: string;
};

export type UpdatePropertyValueInput = {
  databaseId: string;
  hostDatabaseId?: string;
  propertyId: string;
  rowId: string;
  value: unknown;
};

function defineAddDatabaseRowMutation(context: ClientOperationContext) {
  const { queryClient } = context;
  const store = clientDatabaseController(context);
  return clientMutation({
    networkMode: "always",
    mutationFn: async (variables: AddRowInput) => {
      const scope = resolveDataSourceCommandScope(
        queryClient,
        store.sessionId,
        variables.databaseId,
        variables.hostDatabaseId,
      );
      const anchors = resolveCreateAnchors(store.records(scope.dataSourceId), {
        ...variables,
        databaseId: scope.dataSourceId,
      });
      const sourceScope =
        variables.sourceDataSourceId && variables.sourceRowId
          ? resolveDataSourceCommandScope(
              queryClient,
              store.sessionId,
              variables.sourceDataSourceId,
              variables.sourceHostDatabaseId,
            )
          : undefined;
      const sourceRecord = sourceScope
        ? store.records(sourceScope.dataSourceId).find(({ id }) => id === variables.sourceRowId)
        : undefined;
      const targetBootstrap = findDataSourceBootstrap(
        queryClient,
        store.sessionId,
        scope.dataSourceId,
      );
      const sourceBootstrap = sourceScope
        ? findDataSourceBootstrap(queryClient, store.sessionId, sourceScope.dataSourceId)
        : null;
      const valuesByPropertyId = variables.initialValues
        ? Object.fromEntries(
            variables.initialValues.map(({ propertyId, value }) => [propertyId, value]),
          )
        : undefined;
      const previewValues = {
        ...(sourceRecord
          ? previewTransferredValues({
              record: sourceRecord,
              mode: variables.sourcePropertyMode ?? "match",
              sourceProperties: (sourceBootstrap?.properties ?? []).filter(
                ({ dataSourceId }) => dataSourceId === sourceScope?.dataSourceId,
              ),
              targetProperties: (targetBootstrap?.properties ?? []).filter(
                ({ dataSourceId }) => dataSourceId === scope.dataSourceId,
              ),
            })
          : {}),
        ...valuesByPropertyId,
      };
      const parentRowId = variables.hierarchy?.parentRowId ?? variables.parentRowId ?? null;
      const temporaryId = "pending:" + crypto.randomUUID();
      const pageId = variables.pageId ?? "pending-page:" + crypto.randomUUID();
      const now = new Date().toISOString();
      const record: DatabaseRecordEntity = {
        id: temporaryId,
        pageId,
        dataSourceId: scope.dataSourceId,
        parentRowId,
        orderKey: "0.0000000000",
        createdAt: now,
        updatedAt: now,
        page: sourceRecord
          ? {
              ...sourceRecord.page,
              ...(variables.title !== undefined ? { name: variables.title } : {}),
            }
          : {
              id: pageId,
              name: variables.title ?? variables.previewTitle ?? "Untitled",
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
              hasContent: false,
              metadata: null,
            },
        valuesByPropertyId: {},
      };
      const effects: RecordEffect[] = [
        {
          dataSourceId: scope.dataSourceId,
          rowId: temporaryId,
          record,
          placement: anchors,
          values: previewValues,
        },
      ];
      if (variables.hierarchy) {
        const rows = [...store.records(scope.dataSourceId), record];
        for (const change of changeRecordHierarchy({
          ...variables.hierarchy,
          rowId: temporaryId,
          rows,
          values: rows.flatMap(({ valuesByPropertyId }) => Object.values(valuesByPropertyId)),
        }))
          effects.push({
            dataSourceId: scope.dataSourceId,
            rowId: change.rowId,
            values: { [change.propertyId]: change.value },
          });
      }
      const source =
        sourceScope && sourceScope.dataSourceId !== scope.dataSourceId
          ? {
              databaseId: sourceScope.hostDatabaseId,
              dataSourceId: sourceScope.dataSourceId,
              rowId: variables.sourceRowId!,
              propertyMode: variables.sourcePropertyMode ?? ("match" as const),
            }
          : undefined;
      if (source)
        effects.push({
          dataSourceId: source.dataSourceId,
          rowId: source.rowId,
          remove: true,
          record: sourceRecord,
        });
      const ack = await store.submit(
        {
          databaseId: scope.hostDatabaseId,
          dataSourceId: scope.dataSourceId,
          command: {
            type: "row.place",
            ...(variables.clearSortViewId ? { clearSortViewId: variables.clearSortViewId } : {}),
            ...anchors,
            pageId: variables.pageId,
            parentRowId,
            title: variables.title,
            hierarchy: variables.hierarchy,
            valuesByPropertyId,
            ...(source ? { source } : {}),
          },
        },
        effects,
        temporaryId,
      );

      return ack.result as DatabaseRecordEntity;
    },
  });
}
export type AddDatabaseRowInput = Parameters<
  NonNullable<ReturnType<typeof defineAddDatabaseRowMutation>["mutationFn"]>
>[0];
export type AddDatabaseRowResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineAddDatabaseRowMutation>["mutationFn"]>>
>;
export function addDatabaseRow(
  context: ClientOperationContext,
  input: AddDatabaseRowInput,
): Promise<AddDatabaseRowResult> {
  return runClientMutation(context, input, defineAddDatabaseRowMutation);
}

function defineUpdateDatabasePropertyValueMutation(context: ClientOperationContext) {
  const { queryClient } = context;
  const store = clientDatabaseController(context);
  return clientMutation({
    networkMode: "always",
    mutationFn: async (input: UpdatePropertyValueInput) => {
      const scope = resolveDataSourceCommandScope(
        queryClient,
        store.sessionId,
        input.databaseId,
        input.hostDatabaseId,
      );
      const ack = await submitRecordChange(store, {
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
        rowId: input.rowId,
        valuesByPropertyId: { [input.propertyId]: input.value },
      });
      return ack.result as DatabaseRecordEntity;
    },
  });
}
export type UpdateDatabasePropertyValueInput = Parameters<
  NonNullable<ReturnType<typeof defineUpdateDatabasePropertyValueMutation>["mutationFn"]>
>[0];
export type UpdateDatabasePropertyValueResult = Awaited<
  ReturnType<
    NonNullable<ReturnType<typeof defineUpdateDatabasePropertyValueMutation>["mutationFn"]>
  >
>;
export function updateDatabasePropertyValue(
  context: ClientOperationContext,
  input: UpdateDatabasePropertyValueInput,
): Promise<UpdateDatabasePropertyValueResult> {
  return runClientMutation(context, input, defineUpdateDatabasePropertyValueMutation);
}

function defineArchiveDatabaseRowMutation(context: ClientOperationContext) {
  return databaseRowStateMutation(context, "row.archive");
}
export type ArchiveDatabaseRowInput = Parameters<
  NonNullable<ReturnType<typeof defineArchiveDatabaseRowMutation>["mutationFn"]>
>[0];
export type ArchiveDatabaseRowResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineArchiveDatabaseRowMutation>["mutationFn"]>>
>;
export function archiveDatabaseRow(
  context: ClientOperationContext,
  input: ArchiveDatabaseRowInput,
): Promise<ArchiveDatabaseRowResult> {
  return runClientMutation(context, input, defineArchiveDatabaseRowMutation);
}

function defineRestoreDatabaseRowMutation(context: ClientOperationContext) {
  return databaseRowStateMutation(context, "row.restore");
}
export type RestoreDatabaseRowInput = Parameters<
  NonNullable<ReturnType<typeof defineRestoreDatabaseRowMutation>["mutationFn"]>
>[0];
export type RestoreDatabaseRowResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineRestoreDatabaseRowMutation>["mutationFn"]>>
>;
export function restoreDatabaseRow(
  context: ClientOperationContext,
  input: RestoreDatabaseRowInput,
): Promise<RestoreDatabaseRowResult> {
  return runClientMutation(context, input, defineRestoreDatabaseRowMutation);
}

function databaseRowStateMutation(
  context: ClientOperationContext,
  type: "row.archive" | "row.restore",
) {
  const { queryClient } = context;
  const store = clientDatabaseController(context);
  return clientMutation({
    networkMode: "always",
    mutationFn: async (input: { databaseId: string; hostDatabaseId?: string; rowId: string }) => {
      const scope = resolveDataSourceCommandScope(
        queryClient,
        store.sessionId,
        input.databaseId,
        input.hostDatabaseId,
      );
      const record = store
        .records(scope.dataSourceId, { includeDeleted: type === "row.restore" })
        .find(({ id }) => id === input.rowId);
      const ack = await store.submit(
        {
          databaseId: scope.hostDatabaseId,
          dataSourceId: scope.dataSourceId,
          command: { type, rowId: input.rowId },
        },
        [
          {
            dataSourceId: scope.dataSourceId,
            rowId: input.rowId,
            record,
            remove: type === "row.archive",
          },
        ],
      );
      return ack.result as DatabaseRecordEntity;
    },
  });
}

function resolveCreateAnchors(records: DatabaseRecordEntity[], input: AddRowInput) {
  if (input.beforeRowId !== undefined || input.afterRowId !== undefined)
    return { afterRowId: input.afterRowId ?? null, beforeRowId: input.beforeRowId ?? null };
  const index = Math.max(0, Math.min(input.position ?? records.length, records.length));
  return { afterRowId: records[index - 1]?.id ?? null, beforeRowId: records[index]?.id ?? null };
}
