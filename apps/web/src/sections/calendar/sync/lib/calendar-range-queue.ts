import {
  requestCalendarIntervals as requestIntervals,
  type CalendarWindow,
} from "@zilobase/features/calendar";
import { emitCalendarMetric } from "@/platform/diagnostics/calendar-metrics";
export function requestCalendarIntervals(
  scope: string,
  account: string,
  range: CalendarWindow,
  run: (range: CalendarWindow, signal: AbortSignal) => Promise<void>,
  priority = 0,
  signal?: AbortSignal,
) {
  return requestIntervals(scope, account, range, run, priority, signal, (count) =>
    emitCalendarMetric("duplicate_read", count),
  );
}
