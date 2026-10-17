import { sharedClient } from "../data/client";
import { useIsMutating, useMutation, useQuery } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import { calendarApiBasePath } from "./model";
import { calendarPreferencesQueryOptions } from "./queries";
import type { CalendarPreferences } from "./contracts";
export function useCalendarPreferences(workspaceId: string, onError?: (error: unknown) => void) {
  const { apiFetch, queryClient: client } = useZilobaseFeatures();
  const options = calendarPreferencesQueryOptions(apiFetch, workspaceId),
    queryKey = options.queryKey,
    path = `${calendarApiBasePath(workspaceId)}/preferences`;
  const query = useQuery(options);
  const pending = useIsMutating({ mutationKey: queryKey }) > 0;
  const save = useMutation({
    mutationKey: queryKey,
    onMutate: () => sharedClient(client).capture(),
    mutationFn: (data: CalendarPreferences) =>
      apiFetch<CalendarPreferences>(path, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: (data, _variables, capture) => {
      if (capture && sharedClient(client).isCurrent(capture)) client.setQueryData(queryKey, data);
    },
    onError,
  });
  return { query, save, pending };
}
