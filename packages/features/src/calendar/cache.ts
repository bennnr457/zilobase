import type { CalendarEvent } from "./contracts";
import { eventOverlaps } from "../calendar-layout/time";

export function readableCalendar(
  calendar: { permissions: { read: boolean; freeBusyOnly: boolean }; id: string },
  hiddenKeys: string[] | undefined,
  bindingId: string,
) {
  return (
    calendar.permissions.read &&
    !calendar.permissions.freeBusyOnly &&
    !hiddenKeys?.includes(JSON.stringify([bindingId, calendar.id]))
  );
}
export function freshCalendarRange(
  prior: { fetchedAt: number; revision: number; generation: number } | undefined,
  state: { revision: number; generation: number } | undefined,
) {
  return Boolean(
    prior &&
    Date.now() - prior.fetchedAt < 2000 &&
    (!state || (state.revision <= prior.revision && state.generation <= prior.generation)),
  );
}

export function belongsToRange(
  event: CalendarEvent,
  range: { calendarId: string; start: string; end: string },
) {
  return (
    range.calendarId === event.calendarId &&
    eventOverlaps(event, range.start, range.end, event.start.timeZone ?? "UTC")
  );
}
