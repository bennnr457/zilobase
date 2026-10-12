import type { DatabasePropertyValue } from "../schema/property-values";

export function getSharedDatabaseSelectionValue(
  values: DatabasePropertyValue[],
  areEqual: (left: DatabasePropertyValue, right: DatabasePropertyValue) => boolean,
) {
  const firstValue = values[0] ?? "";
  const mixed = values.some((value) => !areEqual(firstValue, value));

  return {
    mixed,
    value: mixed ? "" : firstValue,
  };
}
