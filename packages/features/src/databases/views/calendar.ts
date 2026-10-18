import { addDays, addHours, startOfDay } from "date-fns";
import {
  parseDatabaseDateRange,
  toDatabaseDateValue,
  getDatabaseTimeValue,
} from "../schema/date-value";
import type { DatabasePropertyValue } from "../schema/property-values";
import type { DatabasePropertyListItem } from "./grouping";
import { getTimelineDateProperty } from "./timeline-date";

export type DatabaseCalendarMode = "month" | "week" | "day" | "agenda";
export type DatabaseCalendarSchedule = { start: Date; end: Date; allDay: boolean };

export function getDatabaseCalendarMode(config: unknown): DatabaseCalendarMode {
  const mode = (config as { calendarView?: unknown } | null)?.calendarView;
  return mode === "week" || mode === "day" || mode === "agenda" ? mode : "month";
}

export function getCalendarDateProperty(properties: DatabasePropertyListItem[], config: unknown) {
  return getTimelineDateProperty(properties, config);
}

/** Database all-day ends are inclusive; calendar layout ends are exclusive. */
export function parseCalendarSchedule(
  value: DatabasePropertyValue,
): DatabaseCalendarSchedule | null {
  const { start, end, startTime, endTime } = parseDatabaseDateRange(value);
  if (!start || (Array.isArray(value) && value[1] && !end)) return null;
  const allDay =
    !startTime &&
    !endTime &&
    (Array.isArray(value) ? value : [value]).every((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v));
  if (end && end < start) return null;
  return {
    start,
    end: allDay ? addDays(end ?? start, 1) : end && end > start ? end : addHours(start, 1),
    allDay,
  };
}

export function calendarScheduleToValue(
  schedule: DatabaseCalendarSchedule,
  previous?: DatabasePropertyValue,
  preserveScalar = false,
): DatabasePropertyValue {
  const { start, end, allDay } = schedule;
  if (allDay) {
    const first = toDatabaseDateValue(start);
    const last = toDatabaseDateValue(addDays(startOfDay(end), -1));
    return first >= last ? first : [first, last];
  }
  const first = toDatabaseDateValue(start, getDatabaseTimeValue(start));
  if (preserveScalar && typeof previous === "string") return first;
  return [first, toDatabaseDateValue(end, getDatabaseTimeValue(end))];
}

export function calendarClickSchedule(date: Date, allDay: boolean): DatabaseCalendarSchedule {
  const start = allDay ? startOfDay(date) : date;
  return { start, end: allDay ? addDays(start, 1) : addHours(start, 1), allDay };
}
