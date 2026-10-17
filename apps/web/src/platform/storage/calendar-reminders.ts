import {
  calendarEventKey,
  canClaimCalendarReminder,
  type DueCalendarReminder,
  type CalendarCacheStore,
} from "@zilobase/features/calendar";
import { CalendarDatabase, calendarCacheDatabaseIfAvailable } from "./calendar-database";
const runtimeClaims = new WeakMap<CalendarCacheStore, Map<string, number>>();
export async function claimCalendarReminder(
  backing: CalendarDatabase | CalendarCacheStore,
  reminder: DueCalendarReminder,
  now = Date.now(),
) {
  const database =
    "reminders" in backing
      ? (backing as CalendarDatabase)
      : calendarCacheDatabaseIfAvailable(backing);
  if (!database) {
    const store = backing as CalendarCacheStore;
    return store.transaction("rw", async (tx) => {
      let claims = runtimeClaims.get(store);
      if (!claims) {
        claims = new Map();
        runtimeClaims.set(store, claims);
      }
      for (const [key, expires] of claims) if (expires < now) claims.delete(key);
      if (claims.has(reminder.key)) return false;
      const key = calendarEventKey(reminder.event);
      const current = (await tx.readEvents([key]))[0]?.event;
      if (
        !(await canClaimCalendarReminder(
          current,
          reminder,
          async () => (await tx.readPending(key)).length,
        ))
      )
        return false;
      claims.set(reminder.key, reminder.expiresAt);
      return true;
    });
  }
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
        !(await canClaimCalendarReminder(current?.event, reminder, () =>
          database.pending.where("eventKey").equals(key).count(),
        ))
      )
        return false;
      await database.reminders.where("expiresAt").below(now).delete();
      await database.reminders.add({ key: reminder.key, expiresAt: reminder.expiresAt });
      return true;
    },
  );
}
