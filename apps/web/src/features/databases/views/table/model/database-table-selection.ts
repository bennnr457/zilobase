export const DATABASE_SELECTION_PRIMARY_PROPERTY_LIMIT = 5;

export function splitDatabaseSelectionProperties<T>(
  properties: T[],
  limit = DATABASE_SELECTION_PRIMARY_PROPERTY_LIMIT,
) {
  const primaryCount = Math.max(0, limit);

  return {
    overflow: properties.slice(primaryCount),
    primary: properties.slice(0, primaryCount),
  };
}

export { getSharedDatabaseSelectionValue } from "@zilobase/features/databases";
