import { useCalendarCache as useSharedCalendarCache } from "@zilobase/features/calendar/react";
import type { CalendarConnection, CalendarWindow } from "@zilobase/features/calendar";
import { useEffect, useState } from "react";
import type { PendingCalendarMutation } from "@zilobase/features/calendar";
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
) => startCalendarRecovery(store, refresh, () => getConnectivityState() === "online");
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
  const [pending, setPending] = useState<PendingCalendarMutation[]>([]);
  useEffect(() => {
    setPending([]);
    return state.database?.observe(
      (store) => store.readPending(),
      setPending,
      () => {},
    );
  }, [state.database]);
  return { ...state, pending };
}
