import { getDatabaseEmoji } from "../databases/views/appearance";
import type {
  DatabasePropertyEntity,
  DatabaseRecordEntity,
  DatabaseViewEntity,
  DataSourceEntity,
  PagePropertyValueEntity,
} from "../databases/contracts";
import type { DatabaseExportPayload } from "../databases/core/export-payload";
import type { DatabaseViewData } from "../databases/views/source-state";
import { databaseOrderKeyAtPosition } from "../databases/core/order-key";
import {
  getMergedPropertyConfig,
  type DatabasePropertyConfig,
} from "../databases/views/configuration";
import { getTaskDatabaseSchema, getSelectOptions, type TaskRow } from "./model";
export const TASKS_DATABASE_ID = "my-tasks";
export const TASKS_DATA_SOURCE_ID = "my-tasks:source";
export const TASKS_VIEW_ID = "my-tasks-list";
export const STATUS_COLUMN_ID = "my-tasks-status-column";
export const STATUS_PROPERTY_ID = "my-tasks-status";
export const ASSIGNEE_COLUMN_ID = "my-tasks-assignee-column";
export const ASSIGNEE_PROPERTY_ID = "my-tasks-assignee";
export const DUE_DATE_COLUMN_ID = "my-tasks-due-date-column";
export const DUE_DATE_PROPERTY_ID = "my-tasks-due-date";
export const SOURCE_COLUMN_ID = "my-tasks-source-column";
export const SOURCE_PROPERTY_ID = "my-tasks-source";
export function buildTasksViewData({
  databaseConfig,
  propertyConfigs,
  rows,
  sourcePayloads,
  viewConfig,
  workspaceId,
}: {
  databaseConfig: unknown;
  propertyConfigs: Record<string, unknown>;
  rows: TaskRow[];
  sourcePayloads: DatabaseExportPayload[];
  viewConfig: unknown;
  workspaceId: string | null | undefined;
}): DatabaseViewData {
  const statusOptions = Array.from(
    new Map(
      sourcePayloads
        .flatMap((source) => {
          const status = getTaskDatabaseSchema(source).status;
          return status ? getSelectOptions(status.property.config) : [];
        })
        .map((option) => [option.name, option]),
    ).values(),
  );
  const sourceSummaries = Object.fromEntries(
    sourcePayloads.map((source) => {
      const emoji = getDatabaseEmoji({ config: source.database.dataSourceConfig });
      return [
        `task-source:${source.database.id}`,
        {
          iconKind: "database",
          id: `task-source:${source.database.id}`,
          metadata: emoji ? { emoji } : null,
          name: (source.activeDataSource?.name ?? source.database.name) || "Untitled database",
        },
      ];
    }),
  );
  const propertyDefinitions = [
    {
      config: { options: statusOptions },
      databasePropertyId: STATUS_COLUMN_ID,
      id: STATUS_PROPERTY_ID,
      name: "Status",
      type: "status",
    },
    {
      config: undefined,
      databasePropertyId: ASSIGNEE_COLUMN_ID,
      id: ASSIGNEE_PROPERTY_ID,
      name: "Assignee",
      type: "person",
    },
    {
      config: undefined,
      databasePropertyId: DUE_DATE_COLUMN_ID,
      id: DUE_DATE_PROPERTY_ID,
      name: "Due date",
      type: "date",
    },
    {
      config: {
        pageSummaries: sourceSummaries,
        relation: { limit: "one_page" },
      },
      databasePropertyId: SOURCE_COLUMN_ID,
      id: SOURCE_PROPERTY_ID,
      name: "Source",
      type: "relation",
    },
  ] as const;
  const properties: DatabasePropertyEntity[] = propertyDefinitions.map((definition, position) => ({
    createdAt: "",
    dataSourceId: TASKS_DATA_SOURCE_ID,
    id: definition.databasePropertyId,
    position,
    property: {
      config: getMergedPropertyConfig(
        definition.config,
        propertyConfigs[definition.databasePropertyId] as DatabasePropertyConfig,
      ),
      createdAt: "",
      id: definition.id,
      name: definition.name,
      type: definition.type,
      updatedAt: "",
      workspaceId: workspaceId ?? TASKS_DATABASE_ID,
    },
    propertyId: definition.id,
    updatedAt: "",
    visible: true,
    width: null,
  }));
  const values: PagePropertyValueEntity[] = rows.flatMap((row) => [
    makeValue(row, STATUS_PROPERTY_ID, row.status),
    makeValue(row, ASSIGNEE_PROPERTY_ID, row.assigneeIds),
    makeValue(row, DUE_DATE_PROPERTY_ID, row.dueDate),
    makeValue(row, SOURCE_PROPERTY_ID, [`task-source:${row.databaseId}`]),
  ]);
  const views: DatabaseViewEntity[] = [
    {
      config: viewConfig,
      createdAt: "",
      databaseId: TASKS_DATABASE_ID,
      dataSourceId: TASKS_DATA_SOURCE_ID,
      id: TASKS_VIEW_ID,
      name: "My Tasks",
      position: 0,
      type: "list",
      updatedAt: "",
    },
  ];

  const valuesByPageId = new Map<string, PagePropertyValueEntity[]>();
  for (const value of values) {
    const group = valuesByPageId.get(value.pageId) ?? [];
    group.push(value);
    valuesByPageId.set(value.pageId, group);
  }
  const records: DatabaseRecordEntity[] = rows.map((row, position) => ({
    createdAt: row.createdAt,
    dataSourceId: TASKS_DATA_SOURCE_ID,
    id: getSyntheticRowId(row),
    orderKey: databaseOrderKeyAtPosition(position),
    page: {
      createdAt: row.createdAt,
      deletedAt: null,
      hasContent: false,
      id: row.pageId,
      metadata: row.pageMetadata,
      name: row.title,
      updatedAt: row.updatedAt,
    },
    pageId: row.pageId,
    parentRowId: null,
    updatedAt: row.updatedAt,
    valuesByPropertyId: Object.fromEntries(
      (valuesByPageId.get(row.pageId) ?? []).map((value) => [value.propertyId, value]),
    ),
  }));

  const activeDataSource: DataSourceEntity = {
    config: databaseConfig,
    configVersion: 1,
    createdAt: "",
    id: TASKS_DATA_SOURCE_ID,
    linkedAt: null,
    name: "My Tasks",
    parentDatabaseId: TASKS_DATABASE_ID,
    position: 0,
    updatedAt: "",
    version: 0,
    workspaceId: workspaceId ?? TASKS_DATABASE_ID,
  };

  return {
    activeDataSource,
    bootstrap: {
      database: {
        accessLevel: "full",
        config: databaseConfig,
        createdAt: "",
        deletedAt: null,
        id: TASKS_DATABASE_ID,
        name: "My Tasks",
        pageId: null,
        updatedAt: "",
        version: 0,
        workspaceId: workspaceId ?? TASKS_DATABASE_ID,
      },
      dataSources: [activeDataSource],
      properties,
      views,
    },
    dataSourceId: TASKS_DATA_SOURCE_ID,
    hasMore: false,
    records,
    totalCount: records.length,
  };
}

function makeValue(row: TaskRow, propertyId: string, value: unknown): PagePropertyValueEntity {
  return {
    createdAt: row.createdAt,
    id: `${getSyntheticRowId(row)}:${propertyId}`,
    pageId: row.pageId,
    propertyId,
    updatedAt: row.updatedAt,
    value,
  };
}

export function getSyntheticRowId(row: TaskRow) {
  return `${row.databaseId}:${row.rowId}`;
}
