import type { CalendarEvent } from "./contracts";
import { timedLayoutByKey } from "../calendar-layout/time";

export type * from "./contracts";
export { orderCalendarSources, moveCalendarSource } from "./source-order";
export { calendarConnectionReturnPath } from "./onboarding";
export {
  calendarCapability,
  eventEditorCapability,
  type CalendarCapability,
  type CalendarOperation,
} from "./capabilities";
export {
  newCalendarEvent,
  calendarApiBasePath,
  calendarKeys,
  calendarEventKey,
  defaultCalendarPreferences,
} from "./model";
export {
  calendarDate,
  dayInstant,
  addCalendarDays,
  todayInZone,
  wallTime,
  eventInstant,
  eventOverlaps,
  calendarDays,
  shiftCalendarPeriod,
  eventClock,
} from "../calendar-layout/time";
export type { CalendarSpan } from "../calendar-layout/types";
export { createEventIndex } from "../calendar-layout/event-index";
export {
  civilDayOrdinal,
  dateFromOrdinal,
  dateFromRank,
  visibleDateRank,
  contiguousTimeline,
} from "../calendar-layout/timeline";
export { timedLayoutByKey } from "../calendar-layout/time";

export function timedLayout(events: CalendarEvent[], date: string, zone: string) {
  return timedLayoutByKey(events, date, zone, (event) => event.eventId);
}

export { calendarMetric, type CalendarMetricName } from "./telemetry";
export { normalizeCalendarView } from "../calendar-layout/types";
export { calendarLocationUrl, upcomingCalendarMeeting } from "./context";
export { calendarTravelPreferences } from "./travel";
export * from "./selection";
export * from "./time-zones";
export * from "./recovery";
export * from "./coverage";
export * from "./cache";
export * from "./buffer-preferences";
export * from "./reminders";
export * from "./event-write";
export * from "./queries";
export * from "./mutations";
export * from "./search";
export * from "./range-queue";
export * from "./sync-queue";
export * from "./search-model";
export * from "./event-visibility";
