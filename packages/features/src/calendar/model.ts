import { dayInstant, wallTime } from "../calendar-layout/time";
import type { CalendarEvent } from "./contracts";
import type { CalendarIdentity, CalendarPreferences, CalendarScope } from "./contracts";
export function calendarApiBasePath(workspaceId: string) {
  if (!workspaceId.trim()) throw new Error("A workspace is required");
  return `/workspaces/${encodeURIComponent(workspaceId)}/calendar`;
}
export function calendarEventKey(identity: CalendarIdentity) {
  return JSON.stringify([
    identity.workspaceId,
    identity.bindingId,
    identity.calendarId,
    identity.eventId,
  ]);
}
export const calendarKeys = {
  all: ["calendar"] as const,
  sources: (userId: string, workspaceId: string) =>
    ["calendar", "sources", userId, workspaceId] as const,
  connections: (workspaceId: string) => ["calendar", workspaceId, "connections"] as const,
  preferences: (workspaceId: string) => ["calendar", workspaceId, "preferences"] as const,
  calendars: (scope: CalendarScope) =>
    ["calendar", scope.workspaceId, scope.bindingId, "calendars"] as const,
};
export function defaultCalendarPreferences(timeZone = "UTC"): CalendarPreferences {
  return {
    promptTimeZoneChanges: false,
    timeZoneColumns: [{ zone: timeZone, label: timeZone.split("/").at(-1)!.replaceAll("_", " ") }],
    todayAlignment: "week",
    meetingPreviewMinutes: 15,
    mapsProvider: "google",
    hourHeight: 48,
    accountOrder: [],
    calendarOrder: [],
    collapsedAccountIds: [],
    calendarColors: {},
    removedCalendarKeys: [],
    view: "week",
    hiddenCalendarKeys: [],
    defaultCalendarKey: null,
    weekStartsOn: 1,
    showWeekends: true,
    showDeclined: false,
    showWeekNumbers: false,
    timeFormat: "24",
    timeZone,
    remindersEnabled: false,
  };
}

export function newCalendarEvent(input: {
  workspaceId: string;
  bindingId: string;
  calendarId: string;
  date: string;
  timeZone: string;
  hour?: number;
}): CalendarEvent {
  const start =
    input.hour === undefined
      ? dayInstant(input.date, input.timeZone)
      : wallTime(
          input.date,
          `${String(Math.floor(input.hour)).padStart(2, "0")}:${String(Math.round((input.hour % 1) * 60)).padStart(2, "0")}`,
          input.timeZone,
        );
  return {
    workspaceId: input.workspaceId,
    bindingId: input.bindingId,
    calendarId: input.calendarId,
    eventId: `local-${crypto.randomUUID()}`,
    etag: "",
    title: "New event",
    description: "",
    location: "",
    start: { dateTime: start, timeZone: input.timeZone },
    end: {
      dateTime: new Date(Date.parse(start) + 1800_000).toISOString(),
      timeZone: input.timeZone,
    },
    status: "confirmed",
    eventType: "default",
    attendees: [],
    reminders: { useDefault: true },
    transparency: "opaque",
    visibility: "default",
    colorId: null,
    htmlLink: "",
  };
}
