import { sharedClient } from "../data/client";
import { normalizeCalendarCatalog } from "./store";
import { queryOptions } from "@tanstack/react-query";
import type { ApiFetcher } from "../shared/api-fetcher";
import { calendarApiBasePath, calendarKeys } from "./model";
import type {
  CalendarConnection,
  CalendarRecord,
  CalendarPreferences,
  CalendarScope,
  CalendarRangeResponse,
  CalendarRangeRequest,
  CalendarSyncResponse,
  CalendarMutationResponse,
} from "./contracts";
export const calendarSourcesQueryKey = ["calendar", "sources"] as const;
export function calendarAccountsQueryOptions(
  apiFetch: ApiFetcher,
  userId: string,
  workspaceId: string,
) {
  return queryOptions({
    enabled: Boolean(userId),
    queryFn: ({ signal }) =>
      apiFetch<{ connections: CalendarConnection[]; providerConfigured: boolean }>(
        `${calendarApiBasePath(workspaceId)}/sources`,
        { signal },
      ),
    queryKey: calendarKeys.sources(userId, workspaceId),
    refetchInterval: 30_000,
    retry: false,
    staleTime: 30_000,
  });
}
export function calendarCatalogQueryOptions(apiFetch: ApiFetcher, connection: CalendarConnection) {
  return queryOptions({
    queryFn: async ({ signal, client }) => {
      const read = await sharedClient(client).captureRead();
      const response = await apiFetch<{ calendars: CalendarRecord[] }>(
        `${calendarConnectionPath(connection)}/calendars`,
        {
          signal,
        },
      );
      return normalizeCalendarCatalog(
        client,
        read,
        connection.workspaceId,
        connection.bindingId,
        response.calendars,
      );
    },
    queryKey: calendarKeys.calendars(connection),
    retry: false,
    staleTime: 60_000,
  });
}
export function calendarPreferencesQueryOptions(apiFetch: ApiFetcher, workspaceId: string) {
  return queryOptions({
    queryFn: ({ signal }) =>
      apiFetch<CalendarPreferences>(`${calendarApiBasePath(workspaceId)}/preferences`, { signal }),
    queryKey: calendarKeys.preferences(workspaceId),
    staleTime: 60_000,
  });
}
export function integrationAvailabilityQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null,
) {
  return queryOptions({
    enabled: Boolean(workspaceId),
    queryFn: ({ signal }) =>
      apiFetch<{ providerConfigured?: boolean }>(
        `/workspaces/${encodeURIComponent(workspaceId!)}/calendar/sources`,
        { signal },
      ),
    queryKey: ["integrations", "calendar", workspaceId] as const,
    retry: false,
    staleTime: 60_000,
  });
}
export function calendarConnectionPath(scope: CalendarScope) {
  return `${calendarApiBasePath(scope.workspaceId)}/connections/${encodeURIComponent(scope.bindingId)}`;
}
export function readCalendarMutation(
  apiFetch: ApiFetcher,
  workspaceId: string,
  operationId: string,
) {
  return apiFetch<CalendarMutationResponse>(
    `${calendarApiBasePath(workspaceId)}/operations/${encodeURIComponent(operationId)}`,
  );
}
export function calendarRecoveryTicket(apiFetch: ApiFetcher, scope: CalendarScope) {
  return apiFetch<{
    websocketUrl: string;
    websocketProtocols: string[];
    expiresAt: string;
    providerWatchExpiresAt: string | null;
  }>(`${calendarConnectionPath(scope)}/realtime-ticket`, { method: "POST" });
}
export function calendarCatalog(apiFetch: ApiFetcher, scope: CalendarScope) {
  return apiFetch<Pick<CalendarSyncResponse, "calendars">>(
    `${calendarConnectionPath(scope)}/catalog`,
  );
}
export function synchronizeCalendar(apiFetch: ApiFetcher, scope: CalendarScope) {
  return apiFetch<CalendarSyncResponse>(`${calendarConnectionPath(scope)}/sync`, {
    method: "POST",
    body: "{}",
  });
}
export function readCalendarRange(
  apiFetch: ApiFetcher,
  scope: CalendarScope,
  input: CalendarRangeRequest,
  signal: AbortSignal,
) {
  return apiFetch<CalendarRangeResponse>(
    `${calendarConnectionPath(scope)}/ranges?${new URLSearchParams(input)}`,
    { signal },
  );
}
