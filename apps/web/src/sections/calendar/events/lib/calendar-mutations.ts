import {
  runCalendarMutation as runMutation,
  reconcileCalendarMutations as reconcile,
} from "@zilobase/features/calendar";
import { calendarCacheStore, type CalendarDatabase } from "@/platform/storage/calendar-database";
import { apiFetch } from "@/platform/network/api";
export function runCalendarMutation(
  input: Omit<Parameters<typeof runMutation>[0], "database"> & { database: CalendarDatabase },
  transport = apiFetch,
) {
  return runMutation({ ...input, database: calendarCacheStore(input.database) }, transport);
}
export function reconcileCalendarMutations(database: CalendarDatabase, transport = apiFetch) {
  return reconcile(calendarCacheStore(database), transport);
}
