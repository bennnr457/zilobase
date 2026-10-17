import { getDatabasePropertyCellKind } from "../schema/property-capabilities";
import { isReadOnlyPropertyType } from "../schema/property-defaults";
import { parseDatabaseDateValue } from "../schema/date-value";
import { isValidNumber } from "../schema/input-value";
import type { DatabasePropertyValue } from "../schema/property-values";
import { getGroupOptions, type DatabasePropertyListItem } from "../views/grouping";
import { areSerializedPropertyValuesEqual } from "../interactions/item-utils";
import type { DatabaseCellFillHistoryChange } from "./cell-fill";

type PersonOption = { id: string; name: string };

export function isDatabaseSpreadsheetWritable(type: string) {
  return (
    type !== "id" &&
    !isReadOnlyPropertyType(type) &&
    ["input", "checkbox", "date", "select", "person"].includes(getDatabasePropertyCellKind(type))
  );
}

function stringList(raw: string): string[] | undefined {
  if (raw.startsWith("[")) {
    try {
      const values: unknown = JSON.parse(raw);
      return Array.isArray(values) && values.every((value) => typeof value === "string")
        ? values
        : undefined;
    } catch {
      return undefined;
    }
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function resolveOption(raw: string, options: PersonOption[], byId: boolean) {
  const exactId = options.find((option) => option.id === raw);
  if (byId && exactId) return exactId;
  const matches = options.filter(
    (option) => option.name.toLocaleLowerCase() === raw.toLocaleLowerCase(),
  );
  return matches.length === 1 ? matches[0] : matches.length === 0 ? exactId : undefined;
}

/** Undefined rejects a cell. Empty input is an intentional clear, never invalid coercion. */
export function parseDatabaseSpreadsheetValue(
  property: DatabasePropertyListItem,
  raw: string,
  people: PersonOption[] = [],
): DatabasePropertyValue | undefined {
  const { type } = property.property;
  if (!isDatabaseSpreadsheetWritable(type)) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (type === "number")
    return isValidNumber(trimmed) && Number.isFinite(Number(trimmed)) ? trimmed : undefined;
  if (type === "checkbox") {
    if (["true", "yes", "1", "checked"].includes(trimmed.toLowerCase())) return "true";
    if (["false", "no", "0", "unchecked"].includes(trimmed.toLowerCase())) return "false";
    return undefined;
  }
  if (type === "date") {
    let values: string[] | undefined;
    if (trimmed.startsWith("[")) values = stringList(trimmed);
    else values = trimmed.split(/\s+(?:→|–|to)\s+/);
    if (!values?.length || values.length > 2) return undefined;
    const valid = values.every(
      (value) =>
        /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(
          value,
        ) &&
        parseDatabaseDateValue(value.slice(0, 10)) &&
        parseDatabaseDateValue(value),
    );
    if (
      !valid ||
      (values.length === 2 &&
        parseDatabaseDateValue(values[1])!.getTime() < parseDatabaseDateValue(values[0])!.getTime())
    )
      return undefined;
    return values.length === 1 ? values[0] : values;
  }
  if (["select", "status", "multi_select", "person"].includes(type)) {
    const multiple = type === "multi_select" || type === "person";
    const values = multiple ? stringList(trimmed) : [trimmed];
    const options = type === "person" ? people : getGroupOptions(property);
    const resolved = values?.map((value) => resolveOption(value, options, type === "person"));
    if (!resolved || resolved.some((option) => !option)) return undefined;
    const result = [
      ...new Set(resolved.map((option) => (type === "person" ? option!.id : option!.name))),
    ];
    return multiple ? result : result[0];
  }
  return raw;
}

/** JSON arrays preserve commas and multi-values through TSV copy/fill round trips. */
export function formatDatabaseSpreadsheetValue(value: DatabasePropertyValue): string {
  return Array.isArray(value) ? JSON.stringify(value) : value;
}

export type DatabaseSpreadsheetChange =
  | (DatabaseCellFillHistoryChange & { kind: "property" })
  | { kind: "title"; rowId: string; pageId: string; previousValue: string; nextValue: string };

/** Batch history follows current values, so rollback or another writer cannot be undone accidentally. */
export function createDatabaseSpreadsheetHistoryAction({
  label,
  changes,
  readValue,
  save,
  runWithoutRecording,
}: {
  label: string;
  changes: DatabaseSpreadsheetChange[];
  readValue: (change: DatabaseSpreadsheetChange) => DatabasePropertyValue | undefined;
  save: (change: DatabaseSpreadsheetChange, value: DatabasePropertyValue) => void;
  runWithoutRecording: (work: () => void) => void;
}) {
  let applied = changes;
  let undone: DatabaseSpreadsheetChange[] = [];
  const apply = (candidates: DatabaseSpreadsheetChange[], direction: "undo" | "redo") => {
    const from = direction === "undo" ? "nextValue" : "previousValue";
    const to = direction === "undo" ? "previousValue" : "nextValue";
    const eligible = candidates.filter((change) => {
      const current = readValue(change);
      return (
        current !== undefined &&
        (change.kind === "title"
          ? current === change[from]
          : areSerializedPropertyValuesEqual(change.propertyType, current, change[from]))
      );
    });
    runWithoutRecording(() => eligible.forEach((change) => save(change, change[to])));
    return eligible;
  };
  return {
    label,
    undo: () => {
      undone = apply(applied, "undo");
      applied = [];
      return undone.length > 0;
    },
    redo: () => {
      applied = apply(undone, "redo");
      undone = [];
      return applied.length > 0;
    },
  };
}
