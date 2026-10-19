import { useIsMutating, useMutation, useQuery } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import type { CalendarPreferences } from "./contracts";
import { saveCalendarPreferences } from "./operations";
import { calendarPreferencesQueryOptions } from "./queries";
export function useCalendarPreferences(workspaceId: string, onError?: (error: unknown) => void) {
  const context = useZilobaseFeatures();
  const { apiFetch } = context;
  const options = calendarPreferencesQueryOptions(apiFetch, workspaceId),
    queryKey = options.queryKey;
  const query = useQuery(options);
  const pending = useIsMutating({ mutationKey: queryKey }) > 0;
  const save = useMutation({
    mutationKey: queryKey,
    mutationFn: (preferences: CalendarPreferences) =>
      saveCalendarPreferences(context, { workspaceId, preferences }),
    onError,
  });
  return { query, save, pending };
}
