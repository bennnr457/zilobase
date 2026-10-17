import { getViewDateRange } from "@/components/ui/event-calendar/event-calendar-lib";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  dayInstant,
  todayInZone,
  type CalendarPreferences,
  type CalendarView,
} from "@zilobase/features/calendar";
import { type CalendarWindow } from "@zilobase/features/calendar";
export type CalendarDestination = {
  date: string;
  view: CalendarView;
  days?: number;
  align?: boolean;
};
/** Chrome (toolbar, mini-calendar, heading) follows settled viewport, then the route, then today. */
export function chromeCalendarDate(
  visibleDate: string | null | undefined,
  routeDate: string | undefined,
  zone: string,
) {
  return visibleDate ?? routeDate ?? todayInZone(zone);
}
export function calendarDestinationRange(
  next: CalendarDestination,
  preferences: CalendarPreferences,
): CalendarWindow {
  const { visibleRange } = getViewDateRange(
    next.view,
    new Date(dayInstant(next.date, preferences.timeZone)),
    {
      timeZone: preferences.timeZone,
      weekStartsOn: preferences.weekStartsOn,
      dayCount: 7,
      agendaDayCount: 30,
      fixedWeeks: true,
    },
  );
  return {
    start: new Date(visibleRange.start.getTime()).toISOString(),
    end: new Date(visibleRange.end.getTime()).toISOString(),
  };
}
/** One latest destination; callbacks only run after materialized coverage is ready. */
export function useCalendarNavigation({
  ready,
  online,
  error,
  initial,
  retry,
}: {
  ready: (range: CalendarWindow) => boolean;
  online: boolean;
  error?: unknown;
  initial: CalendarWindow;
  retry: () => void;
}) {
  const [target, setTarget] = useState<CalendarWindow | null>(initial);
  const [pending, setPending] = useState(false);
  const action = useRef<(() => void) | null>(null);
  const state = useRef({ ready, online, error });
  state.current = { ready, online, error };
  const request = useCallback((range: CalendarWindow, commit: () => void) => {
    action.current = commit;
    if (state.current.ready(range)) {
      action.current = null;
      setPending(false);
      setTarget(null);
      commit();
      return;
    }
    setTarget((current) =>
      current?.start === range.start && current.end === range.end ? current : range,
    );
    setPending(true);
  }, []);
  useEffect(() => {
    if (!pending || !target || !ready(target)) return;
    const commit = action.current;
    action.current = null;
    setPending(false);
    setTarget(null);
    commit?.();
  }, [pending, target, ready]);
  const cancel = useCallback(() => {
    action.current = null;
    setPending(false);
    setTarget(null);
  }, []);
  return {
    target,
    pending,
    request,
    cancel,
    retry,
    error: pending
      ? !online
        ? new Error("These dates are not cached. Connect to load them.")
        : error
      : undefined,
  };
}
