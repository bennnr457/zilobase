import type { DatabasePropertyListItem } from "./grouping";
import { getPropertyHidden, getSubItemRelationRole } from "./configuration";

const defaultKanbanVisiblePropertyCount = 3;

export function getDefaultKanbanHiddenPropertyIds(
  properties: DatabasePropertyListItem[],
  groupPropertyId: string | null,
) {
  let visiblePropertyCount = 0;

  return properties.flatMap((property) => {
    const hiddenByDefault =
      property.property.id === groupPropertyId ||
      getPropertyHidden(property.property.config) ||
      Boolean(getSubItemRelationRole(property.property.config)) ||
      visiblePropertyCount >= defaultKanbanVisiblePropertyCount;

    if (hiddenByDefault) {
      return [property.id];
    }

    visiblePropertyCount += 1;
    return [];
  });
}
