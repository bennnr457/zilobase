import { calendarEventKey, type DueCalendarReminder } from "@zilobase/features/calendar";
import type { CalendarDatabase } from "../storage/calendar-database";
export async function claimCalendarReminder(
  database: CalendarDatabase,
  reminder: DueCalendarReminder,
  now = Date.now(),
) {
  return database.transaction(
    "rw",
    database.reminders,
    database.events,
    database.pending,
    async () => {
      if (await database.reminders.get(reminder.key)) return false;
      const key = calendarEventKey(reminder.event),
        current = await database.events.get(key);
      if (
        !current ||
        current.event.status === "cancelled" ||
        JSON.stringify(current.event.start) !== JSON.stringify(reminder.event.start) ||
        (await database.pending.where("eventKey").equals(key).count())
      )
        return false;
      await database.reminders.where("expiresAt").below(now).delete();
      await database.reminders.add({ key: reminder.key, expiresAt: reminder.expiresAt });
      return true;
    },
  );
}
