import { addDays } from "date-fns";
import { parseLocalDateMatch } from "../schema/date-value";
import {
  firstScalarValue,
  serializePropertyValue,
  type DatabasePropertyValue,
} from "../schema/property-values";
import type { DatabasePropertyListItem } from "./grouping";
type DatabaseViewConfig = { datePropertyId?: unknown };
export type TimelineDateRange = { endAt: Date; startAt: Date };
export const DEFAULT_TIMELINE_ITEM_DURATION_DAYS = 5;
export function getTimelineDatePropertyId(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  const datePropertyId = (config as DatabaseViewConfig).datePropertyId;

  return typeof datePropertyId === "string" && datePropertyId.length > 0 ? datePropertyId : null;
}

export function getTimelineDateProperties(properties: DatabasePropertyListItem[]) {
  return properties.filter((property) => property.property.type === "date");
}

export function getTimelineDateProperty(properties: DatabasePropertyListItem[], config: unknown) {
  const configuredDatePropertyId = getTimelineDatePropertyId(config);
  const configuredDateProperty = configuredDatePropertyId
    ? (properties.find((property) => property.property.id === configuredDatePropertyId) ?? null)
    : null;

  return (
    configuredDateProperty ??
    properties.find((property) => property.property.type === "date") ??
    null
  );
}

export function parseRowDateRange(value: DatabasePropertyValue): TimelineDateRange | null {
  if (Array.isArray(value)) {
    const startValue = value[0]?.trim() ?? "";
    const endValue = value[1]?.trim() ?? "";
    const startAt = startValue ? parseStoredDateValue(startValue) : null;
    const endAt = endValue ? parseStoredDateValue(endValue) : startAt ? addDays(startAt, 1) : null;

    if (!startAt || !endAt) {
      return null;
    }

    return { endAt, startAt };
  }

  const scalarValue = firstScalarValue(value).trim();

  if (!scalarValue) {
    return null;
  }

  const startAt = parseStoredDateValue(scalarValue);

  if (!startAt) {
    return null;
  }

  return {
    endAt: addDays(startAt, 1),
    startAt,
  };
}

export function ganttMoveToCellValue(startAt: Date, endAt: Date | null): DatabasePropertyValue {
  const startValue = formatStoredDateValue(startAt);
  const endValue = endAt ? formatStoredDateValue(endAt) : "";

  if (endValue && endValue !== startValue) {
    return [startValue, endValue];
  }

  return startValue;
}

export function ganttMoveToDateValue(startAt: Date, endAt: Date | null) {
  return serializePropertyValue("date", ganttMoveToCellValue(startAt, endAt));
}

function parseStoredDateValue(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const localDateTimeMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);

  if (localDateTimeMatch) {
    const year = Number(localDateTimeMatch[1]);
    const month = Number(localDateTimeMatch[2]);
    const day = Number(localDateTimeMatch[3]);
    const hours = Number(localDateTimeMatch[4]);
    const minutes = Number(localDateTimeMatch[5]);
    const date = new Date(year, month - 1, day, hours, minutes);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dateOnlyMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const { date } = parseLocalDateMatch(dateOnlyMatch);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(trimmedValue);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatStoredDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
