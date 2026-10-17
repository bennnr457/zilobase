import { calendarDate, addCalendarDays, type CalendarEvent } from "@zilobase/features/calendar";
function clock(value: CalendarEvent["start"], zone: string) {
  return value.date
    ? "09:00"
    : new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value.dateTime!));
}
export function eventEditorDefaults(event: CalendarEvent, zone: string) {
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    startDate: calendarDate(event.start, zone),
    endDate: event.end.date ? addCalendarDays(event.end.date, -1) : calendarDate(event.end, zone),
    startTime: clock(event.start, zone),
    endTime: clock(event.end, zone),
    allDay: Boolean(event.start.date),
    timeZone: zone,
    disambiguation: "reject" as "reject" | "earlier" | "later",
    guests: event.attendees.map((a) => a.email).join(", "),
    sendUpdates: "all" as "all" | "none",
    calendarId: event.calendarId,
    bindingId: event.bindingId,
    colorId: event.colorId ?? "default",
    busy: event.transparency,
    visibility: event.visibility === "confidential" ? "private" : event.visibility,
    defaultReminders: event.reminders.useDefault,
    reminder: event.reminders.overrides?.[0]?.minutes ?? 10,
    meet: false,
  };
}
export type EventEditorDraft = ReturnType<typeof eventEditorDefaults>;
