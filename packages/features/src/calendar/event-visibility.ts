import { eventInstant } from "../calendar-layout/time";
import type { CalendarEvent, CalendarPreferences, CalendarRecord } from "./contracts";
import { calendarIsVisible, calendarSelectionKey } from "./selection";
import { orderCalendarSources } from "./source-order";

export function visibleSourceEvent(event: CalendarEvent, preferences: CalendarPreferences) {
  return (
    preferences.showDeclined ||
    !event.attendees.some((attendee) => attendee.self && attendee.responseStatus === "declined")
  );
}

export function visibleScheduleEvent(event: CalendarEvent, preferences: CalendarPreferences) {
  if (!calendarIsVisible(preferences, event.bindingId, event.calendarId)) return false;
  if (preferences.showDeclined) return true;
  return !event.attendees.some((a) => a.self && a.responseStatus === "declined");
}

export function calendarRowSiblings(calendars: CalendarRecord[], preferences: CalendarPreferences) {
  return orderCalendarSources(calendars, preferences.calendarOrder ?? [], (item) =>
    calendarSelectionKey(item.bindingId, item.id),
  )
    .filter(
      (item) =>
        !preferences.removedCalendarKeys?.includes(calendarSelectionKey(item.bindingId, item.id)),
    )
    .map((item) => calendarSelectionKey(item.bindingId, item.id));
}

export function toggleHiddenCalendar(
  preferences: CalendarPreferences,
  key: string,
  hidden: boolean,
) {
  return {
    ...preferences,
    hiddenCalendarKeys: hidden
      ? preferences.hiddenCalendarKeys.filter((id) => id !== key)
      : [...preferences.hiddenCalendarKeys, key],
  };
}

export function sourceCalendarEvents(
  events: CalendarEvent[],
  calendarId: string,
  preferences: CalendarPreferences,
) {
  return events
    .filter(
      (event) =>
        event.calendarId === calendarId &&
        event.status !== "cancelled" &&
        visibleSourceEvent(event, preferences),
    )
    .sort(
      (a, b) =>
        Date.parse(eventInstant(a.start, preferences.timeZone)) -
        Date.parse(eventInstant(b.start, preferences.timeZone)),
    );
}
