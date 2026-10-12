import {
  wallTime,
  addCalendarDays,
  type CalendarEvent,
  type CalendarEventWriteRequest,
} from "./index";
export type CalendarEventEdit = {
  title: string;
  description: string;
  location: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  timeZone: string;
  disambiguation: "reject" | "earlier" | "later";
  guests: string;
  sendUpdates: "all" | "none";
  colorId: string;
  busy: CalendarEvent["transparency"];
  visibility: string;
  defaultReminders: boolean;
  reminder: number;
  meet: boolean;
};
function editorInterval(draft: CalendarEventEdit) {
  const start = draft.allDay
    ? { date: draft.startDate }
    : {
        dateTime: wallTime(draft.startDate, draft.startTime, draft.timeZone, draft.disambiguation),
        timeZone: draft.timeZone,
      };
  const end = draft.allDay
    ? { date: addCalendarDays(draft.endDate, 1) }
    : {
        dateTime: wallTime(draft.endDate, draft.endTime, draft.timeZone, draft.disambiguation),
        timeZone: draft.timeZone,
      };
  if (Date.parse(end.date ?? end.dateTime!) <= Date.parse(start.date ?? start.dateTime!))
    throw new Error("End must be after start.");
  return { start, end };
}
function editorGuests(event: CalendarEvent, value: string) {
  const emails = [
    ...new Set(
      value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  return emails.map(
    (email) =>
      event.attendees.find((a) => a.email === email) ?? {
        email,
        responseStatus: "needsAction" as const,
      },
  );
}
function editorRecurrence(
  event: CalendarEvent,
  draft: CalendarEventEdit,
  recurrence: string[] | undefined,
  scope: string,
) {
  if (!recurrence || (event.recurringEventId && scope === "occurrence")) return {};
  return {
    recurrence: draft.allDay ? recurrence.map((rule) => rule.replace(/T235959Z/g, "")) : recurrence,
  };
}
function editorReminders(event: CalendarEvent, draft: CalendarEventEdit) {
  if (draft.defaultReminders) return { useDefault: true };
  if (!event.reminders.useDefault && draft.reminder === event.reminders.overrides?.[0]?.minutes)
    return event.reminders;
  return { useDefault: false, overrides: [{ method: "popup" as const, minutes: draft.reminder }] };
}
export function editorWrite(
  event: CalendarEvent,
  draft: CalendarEventEdit,
  isNew: boolean,
  recurrence: string[] | undefined,
  scope: "occurrence" | "following" | "series",
): CalendarEventWriteRequest {
  return {
    operationId: crypto.randomUUID(),
    etag: isNew ? undefined : event.etag,
    sendUpdates: draft.sendUpdates,
    recurrenceScope: event.recurringEventId ? scope : undefined,
    createMeet: draft.meet,
    event: {
      ...editorInterval(draft),
      ...editorRecurrence(event, draft, recurrence, scope),
      title: draft.title,
      description: draft.description,
      location: draft.location,
      colorId: draft.colorId === "default" ? null : draft.colorId,
      transparency: draft.busy,
      visibility: draft.visibility as CalendarEvent["visibility"],
      attendees: editorGuests(event, draft.guests),
      reminders: editorReminders(event, draft),
    },
  };
}

export function eventEditorZone(
  event: CalendarEvent,
  calendars: import("./contracts").CalendarRecord[],
) {
  return (
    event.start.timeZone ?? calendars.find((c) => c.id === event.calendarId)?.timeZone ?? "UTC"
  );
}
