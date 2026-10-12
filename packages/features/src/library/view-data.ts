import type {
  DatabasePropertyEntity,
  DatabaseRecordEntity,
  DatabaseViewEntity,
  DataSourceEntity,
  PagePropertyValueEntity,
} from "../databases/contracts";
import { databaseOrderKeyAtPosition } from "../databases/core/order-key";
import type { DatabaseViewData } from "../databases/views/source-state";
import {
  applyHomepageView,
  includeHomepageDescendants,
  libraryParentPropertyId,
  type HomepageView,
  type HomepageRow,
  type RecentsMode,
} from "./model";
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
const homepagePropertyDefinitions = [
  { id: "source", name: "Source", type: "relation" },
  { id: "createdBy", name: "Created by", type: "text" },
  { id: "lastVisitedAt", name: "Last visited time", type: "date" },
  { id: "updatedAt", name: "Last edited time", type: "date" },
  { id: "createdAt", name: "Created time", type: "date" },
  { id: libraryParentPropertyId, name: "Parent item", type: "relation" },
] as const;

const trashPropertyDefinitions = [
  { id: "deletedAt", name: "Deleted at", type: "date" },
  { id: "deletedBy", name: "Deleted by", type: "text" },
] as const;

export function buildHomepageViewData({
  activeViewId,
  databaseConfig,
  mode,
  workspaceId,
  propertyConfigs,
  rows,
  viewConfigs,
  views,
}: {
  activeViewId: string;
  databaseConfig: unknown;
  mode: RecentsMode;
  workspaceId: string | null | undefined;
  propertyConfigs: Record<string, unknown>;
  rows: HomepageRow[];
  viewConfigs: Record<string, unknown>;
  views: { id: string; label: string }[];
}): DatabaseViewData {
  const homepageDatabaseId = mode === "trash" ? "trash" : "homepage";
  const homepageDataSourceId = `${homepageDatabaseId}:source`;
  const propertyDefinitions =
    mode === "trash"
      ? [...homepagePropertyDefinitions, ...trashPropertyDefinitions]
      : homepagePropertyDefinitions;
  const filteredRows = includeHomepageDescendants(
    rows,
    applyHomepageView(rows, activeViewId as HomepageView),
  ).sort((left, right) => left.position - right.position || left.name.localeCompare(right.name));
  const properties: DatabasePropertyEntity[] = propertyDefinitions.map((definition, index) => {
    const propertyConfig = propertyConfigs[definition.id];
    const config =
      definition.id === "source"
        ? {
            ...(isRecord(propertyConfig) ? propertyConfig : {}),
            pageSummaries: Object.fromEntries(
              rows.flatMap((row) => (row.sourcePage ? [[row.sourcePage.id, row.sourcePage]] : [])),
            ),
          }
        : definition.id === libraryParentPropertyId
          ? { subItems: { role: "parent-item" } }
          : propertyConfig;

    return {
      createdAt: "",
      dataSourceId: homepageDataSourceId,
      id: definition.id,
      position: index,
      property: {
        config,
        createdAt: "",
        id: definition.id,
        name: definition.name,
        workspaceId: workspaceId ?? "homepage",
        type: definition.type,
        updatedAt: "",
      },
      propertyId: definition.id,
      updatedAt: "",
      visible: true,
      width: null,
    };
  });
  const values: PagePropertyValueEntity[] = filteredRows.flatMap((row) =>
    propertyDefinitions.map((definition) => ({
      createdAt: row.createdAt,
      id: `${row.id}:${definition.id}`,
      propertyId: definition.id,
      updatedAt: row.updatedAt,
      value:
        definition.id === libraryParentPropertyId
          ? (row.parentRowId ?? "")
          : (row[definition.id] ?? ""),
      pageId: row.id,
    })),
  );

  const valuesByPageId = new Map<string, PagePropertyValueEntity[]>();
  for (const value of values) {
    const group = valuesByPageId.get(value.pageId) ?? [];
    group.push(value);
    valuesByPageId.set(value.pageId, group);
  }
  const records: DatabaseRecordEntity[] = filteredRows.map((row, index) => ({
    createdAt: row.createdAt,
    dataSourceId: homepageDataSourceId,
    id: row.id,
    orderKey: databaseOrderKeyAtPosition(index),
    page: {
      createdAt: row.createdAt,
      deletedAt: null,
      hasContent: false,
      id: row.id,
      metadata: row.metadata,
      name: row.name,
      updatedAt: row.updatedAt,
    },
    pageId: row.id,
    parentRowId: row.parentRowId,
    updatedAt: row.updatedAt,
    valuesByPropertyId: Object.fromEntries(
      (valuesByPageId.get(row.id) ?? []).map((value) => [value.propertyId, value]),
    ),
  }));

  const activeDataSource: DataSourceEntity = {
    config: databaseConfig,
    configVersion: 1,
    createdAt: "",
    id: homepageDataSourceId,
    linkedAt: null,
    name: mode === "trash" ? "Trash" : "Recents",
    parentDatabaseId: homepageDatabaseId,
    position: 0,
    updatedAt: "",
    version: 0,
    workspaceId: workspaceId ?? homepageDatabaseId,
  };

  return {
    activeDataSource,
    bootstrap: {
      database: {
        accessLevel: "full",
        config: databaseConfig,
        createdAt: "",
        deletedAt: null,
        id: homepageDatabaseId,
        name: mode === "trash" ? "Trash" : "Recents",
        workspaceId: workspaceId ?? homepageDatabaseId,
        pageId: homepageDatabaseId,
        updatedAt: "",
        version: 0,
      },
      dataSources: [activeDataSource],
      properties,
      views: views.map((view, index): DatabaseViewEntity => ({
        config: viewConfigs[view.id],
        createdAt: "",
        databaseId: homepageDatabaseId,
        dataSourceId: homepageDataSourceId,
        id: view.id,
        name: view.label,
        position: index,
        type: "table",
        updatedAt: "",
      })),
    },
    dataSourceId: homepageDataSourceId,
    hasMore: false,
    records,
    totalCount: records.length,
  };
}
