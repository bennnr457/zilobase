import type {
  CalendarRecord,
  CalendarConnection,
  CalendarEvent,
  CalendarPreferences,
} from "./contracts";
import { createCalendarSelectionMatcher, calendarSelectionKey } from "./selection";
import { calendarEventKey } from "./model";
import { eventInstant, dayInstant, addCalendarDays } from "../calendar-layout/time";
export function searchSources(
  readable: CalendarRecord[],
  connections: CalendarConnection[],
  source: string,
  matcher: ReturnType<typeof createCalendarSelectionMatcher>,
) {
  return readable
    .flatMap((calendar) => {
      const connection = connections.find(
        (connection) => connection.bindingId === calendar.bindingId,
      );
      if (!connection || !sourceIncludesCalendar(source, matcher, calendar)) return [];
      return [{ calendar, connection }];
    })
    .sort((a, b) =>
      calendarSelectionKey(a.calendar.bindingId, a.calendar.id).localeCompare(
        calendarSelectionKey(b.calendar.bindingId, b.calendar.id),
      ),
    );
}
function sourceIncludesCalendar(
  source: string,
  matcher: ReturnType<typeof createCalendarSelectionMatcher>,
  calendar: CalendarRecord,
) {
  if (source === "all") return matcher.isVisible(calendar.bindingId, calendar.id);
  return source === calendarSelectionKey(calendar.bindingId, calendar.id);
}
export function searchLoadedEvents(
  online: boolean,
  query: string,
  debounced: string,
  pages: CalendarEvent[],
  cached: CalendarEvent[],
) {
  if (!online)
    return cached.filter((event) =>
      `${event.title} ${event.description} ${event.location}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  if (query.trim() !== debounced) return [];
  return pages;
}
export function matchesSearchEvent(
  event: CalendarEvent,
  sources: { calendar: CalendarRecord }[],
  preferences: CalendarPreferences,
  from: string,
  until: string,
) {
  if (event.status === "cancelled") return false;
  if (
    !sources.some(
      ({ calendar }) => calendar.id === event.calendarId && calendar.bindingId === event.bindingId,
    )
  )
    return false;
  if (
    !preferences.showDeclined &&
    event.attendees.some((attendee) => attendee.self && attendee.responseStatus === "declined")
  )
    return false;
  return matchesSearchRange(event, preferences.timeZone, from, until);
}
function matchesSearchRange(event: CalendarEvent, zone: string, from: string, until: string) {
  if (from && Date.parse(eventInstant(event.end, zone)) <= Date.parse(dayInstant(from, zone)))
    return false;
  if (
    until &&
    Date.parse(eventInstant(event.start, zone)) >=
      Date.parse(dayInstant(addCalendarDays(until, 1), zone))
  )
    return false;
  return true;
}
export function uniqueSearchEvents(events: CalendarEvent[], zone: string) {
  return [...new Map(events.map((event) => [calendarEventKey(event), event])).values()].sort(
    (a, b) => Date.parse(eventInstant(a.start, zone)) - Date.parse(eventInstant(b.start, zone)),
  );
}
