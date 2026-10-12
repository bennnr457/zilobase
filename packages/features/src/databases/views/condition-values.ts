import type { DatabaseCondition } from "./filter-sort-contracts";
import type { DatabasePropertyFilterOperator } from "../schema/filter";
export const DEFAULT_RELATIVE_DATE_FILTER_VALUE = "relative:this:week";

export const databaseRelativeDateDirections = [
  { label: "Past", value: "past" },
  { label: "Next", value: "next" },
  { label: "This", value: "this" },
] as const;

export const databaseRelativeDateUnits = [
  { label: "day", value: "day" },
  { label: "week", value: "week" },
  { label: "month", value: "month" },
  { label: "year", value: "year" },
] as const;

export function conditionOperatorNeedsValue(operator: DatabasePropertyFilterOperator) {
  return operator !== "is_empty" && operator !== "is_not_empty";
}

export function parseRelativeDateFilterValue(value: string | undefined) {
  const [, direction, unit] = (value ?? DEFAULT_RELATIVE_DATE_FILTER_VALUE).split(":");

  return {
    direction: databaseRelativeDateDirections.some((item) => item.value === direction)
      ? direction
      : "this",
    unit: databaseRelativeDateUnits.some((item) => item.value === unit) ? unit : "week",
  };
}

export function createRelativeDateFilterValue(direction: string, unit: string) {
  return `relative:${direction}:${unit}`;
}

export function parseDateInput(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const parsedDate = dateValueToDate(trimmedValue);

  return parsedDate ? toDateOnlyValue(parsedDate) : undefined;
}

export function dateValueToDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    const date = new Date(year, month - 1, day);

    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
      ? date
      : null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateOnlyValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getNextConditionValuesForOperator(
  condition: DatabaseCondition,
  operator: DatabasePropertyFilterOperator,
) {
  if (!conditionOperatorNeedsValue(operator)) {
    return [];
  }

  if (operator === "is_relative_to_today") {
    return [
      condition.values[0]?.startsWith("relative:")
        ? condition.values[0]
        : DEFAULT_RELATIVE_DATE_FILTER_VALUE,
    ];
  }

  if (operator === "is_between") {
    return condition.values.slice(0, 2);
  }

  return condition.values.slice(0, 1);
}
