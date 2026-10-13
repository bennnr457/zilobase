import { calendarEventKey, eventInstant, type CalendarEvent, type CalendarRecord } from "./index";
export type DueCalendarReminder = { key: string; event: CalendarEvent; expiresAt: number };
export async function canClaimCalendarReminder(
  event: CalendarEvent | undefined,
  reminder: DueCalendarReminder,
  pendingCount: () => Promise<number>,
) {
  return Boolean(
    event &&
    event.status !== "cancelled" &&
    JSON.stringify(event.start) === JSON.stringify(reminder.event.start) &&
    !(await pendingCount()),
  );
}
export function dueCalendarReminders(
  events: CalendarEvent[],
  calendars: CalendarRecord[],
  now: number,
  startedAt: number,
): DueCalendarReminder[] {
  return events.flatMap((event) => {
    const calendar = calendars.find((c) => c.id === event.calendarId);
    if (
      !calendar ||
      event.status === "cancelled" ||
      event.attendees.some((a) => a.self && a.responseStatus === "declined")
    )
      return [];
    const end = Date.parse(eventInstant(event.end, calendar.timeZone));
    if (end <= now) return [];
    const start = Date.parse(eventInstant(event.start, calendar.timeZone));
    const reminders = event.reminders.useDefault
      ? calendar.defaultReminders
      : (event.reminders.overrides ?? []);
    return reminders
      .filter(
        (r) =>
          r.method === "popup" &&
          start - r.minutes * 60_000 <= now &&
          start - r.minutes * 60_000 >= startedAt - 60_000,
      )
      .map((r) => ({
        key: JSON.stringify([
          calendarEventKey(event),
          event.originalStartTime ?? null,
          start,
          r.minutes,
        ]),
        event,
        expiresAt: end + 86400_000,
      }));
  });
}
