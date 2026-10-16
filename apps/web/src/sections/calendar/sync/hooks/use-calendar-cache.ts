import { useCalendarCache as useSharedCalendarCache } from "@zilobase/features/calendar/react";
import type { CalendarConnection, CalendarWindow } from "@zilobase/features/calendar";
import { calendarCacheDatabase } from "@/platform/storage/calendar-database";
import { emitCalendarMetric } from "@/platform/diagnostics/calendar-metrics";
import { startCalendarRecovery } from "../../realtime/lib/calendar-recovery";
import { toApiUrl } from "@/platform/network/api";
import { subscribeConnectivity, getConnectivityState } from "@/platform/network/connectivity";
const calendarLifecycle = {
  isOnline: () => getConnectivityState() === "online",
  isVisible: () => document.visibilityState !== "hidden",
  subscribe: subscribeConnectivity,
};
const bindRecovery: NonNullable<Parameters<typeof useSharedCalendarCache>[4]["bindRecovery"]> = (
  store,
  refresh,
) =>
  startCalendarRecovery(
    calendarCacheDatabase(store),
    refresh,
    () => getConnectivityState() === "online",
  );
export function useCalendarCache(
  connection: CalendarConnection,
  userId: string,
  start: string,
  end: string,
  options?: { target?: CalendarWindow | null; hiddenKeys: string[] },
) {
  const state = useSharedCalendarCache(connection, userId, start, end, {
    ...options,
    missingOnly: Boolean(options),
    lifecycle: calendarLifecycle,
    apiOrigin: new URL(toApiUrl("/"), window.location.origin).origin,
    bindRecovery,
    onMetric: emitCalendarMetric,
  });
  return { ...state, database: state.database ? calendarCacheDatabase(state.database) : null };
}
