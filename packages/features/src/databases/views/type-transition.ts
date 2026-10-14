import type { DatabaseProperty } from "../core/export-payload";
import { getGroupPropertyId, type DatabasePropertyListItem } from "./grouping";
import { getDefaultKanbanHiddenPropertyIds } from "./kanban-group-settings";
import { hasViewHiddenPropertyIds } from "../interactions/item-utils";
import { getMergedDatabaseConfig, getViewHiddenPropertyIds } from "./configuration";

type ViewTypeTransition = {
  currentConfig: unknown;
  type: string;
  previousType: string;
  kanbanGroupProperty: DatabasePropertyListItem | null;
  properties: DatabaseProperty[];
};

export function getConvertedViewConfig(input: ViewTypeTransition) {
  if (input.type === "kanban") return getKanbanConfig(input);
  if (input.type === "table" && input.previousType === "kanban")
    return getUngroupedTableConfig(input);
  return input.currentConfig;
}

type GroupingInput = Pick<
  ViewTypeTransition,
  "currentConfig" | "kanbanGroupProperty" | "properties"
>;

function getKanbanConfig({ currentConfig, kanbanGroupProperty, properties }: GroupingInput) {
  const groupPropertyId =
    kanbanGroupProperty?.property.id ?? (properties.length === 0 ? "name" : null);

  return getMergedDatabaseConfig(currentConfig, {
    groupPropertyId: groupPropertyId ?? undefined,
    hiddenPropertyIds: hasViewHiddenPropertyIds(currentConfig)
      ? [
          ...new Set([
            ...getViewHiddenPropertyIds(currentConfig),
            ...properties
              .filter((property) => property.property.id === groupPropertyId)
              .map((property) => property.id),
          ]),
        ]
      : getDefaultKanbanHiddenPropertyIds(properties, groupPropertyId),
  });
}

function getUngroupedTableConfig({
  currentConfig,
  kanbanGroupProperty,
  properties,
}: GroupingInput) {
  const previousGroupPropertyId =
    getGroupPropertyId(currentConfig) ?? kanbanGroupProperty?.property.id ?? null;
  const previousGroupProperty = properties.find(
    (property) => property.property.id === previousGroupPropertyId,
  );
  const hiddenPropertyIds = new Set(
    hasViewHiddenPropertyIds(currentConfig)
      ? getViewHiddenPropertyIds(currentConfig)
      : getDefaultKanbanHiddenPropertyIds(properties, previousGroupPropertyId),
  );

  if (previousGroupProperty) {
    hiddenPropertyIds.delete(previousGroupProperty.id);
  }

  return getMergedDatabaseConfig(removeDatabaseGroupProperty(currentConfig), {
    hiddenPropertyIds: [...hiddenPropertyIds],
  });
}

export function removeDatabaseGroupProperty(config: unknown) {
  const nextConfig = getMergedDatabaseConfig(config, {});

  delete nextConfig.groupPropertyId;
  return nextConfig;
}
