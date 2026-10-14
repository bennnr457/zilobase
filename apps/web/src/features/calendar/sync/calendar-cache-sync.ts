import { synchronizeCalendarCache as synchronize } from "@zilobase/features/calendar";
import { calendarCacheStore, type CalendarDatabase } from "../storage/calendar-database";
import { emitCalendarMetric } from "../metrics";
export function synchronizeCalendarCache(
  database: CalendarDatabase,
  start: string,
  end: string,
  transport: Parameters<typeof synchronize>[3],
  recover = true,
  options: Parameters<typeof synchronize>[5] = {},
) {
  return synchronize(calendarCacheStore(database), start, end, transport, recover, {
    ...options,
    onMetric: emitCalendarMetric,
  });
}
