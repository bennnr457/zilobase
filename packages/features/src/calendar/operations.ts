import { captureClientOperation, type ClientOperationContext } from "../shared/operation-context";
import { runClientMutation } from "../shared/operation-mutation";
import { reconcileCalendarMutations, runCalendarMutation } from "./commands";
import type { CalendarConnection, CalendarPreferences } from "./contracts";
import { calendarApiBasePath } from "./model";
import { disconnectCalendar, startCalendarConnection } from "./mutations";
import { calendarPreferencesQueryOptions, calendarSourcesQueryKey } from "./queries";
import type { CalendarCacheStore } from "./storage";

export type ExecuteCalendarMutationInput = Omit<
  Parameters<typeof runCalendarMutation>[0],
  "isCurrent"
> & { isCurrent?: () => boolean };
export function executeCalendarMutation(
  context: ClientOperationContext,
  input: ExecuteCalendarMutationInput,
) {
  const scope = captureClientOperation(context);
  return runCalendarMutation(
    { ...input, isCurrent: () => scope.isCurrent() && (input.isCurrent?.() ?? true) },
    scope.context.apiFetch,
  );
}
export function reconcileCalendarWrites(
  context: ClientOperationContext,
  input: { database: CalendarCacheStore; isCurrent?: () => boolean },
) {
  const scope = captureClientOperation(context);
  return reconcileCalendarMutations(
    input.database,
    scope.context.apiFetch,
    () => scope.isCurrent() && (input.isCurrent?.() ?? true),
  );
}
export function saveCalendarPreferences(
  context: ClientOperationContext,
  input: { workspaceId: string; preferences: CalendarPreferences },
) {
  return runClientMutation(context, input, ({ apiFetch, queryClient }) => ({
    mutationFn: ({ workspaceId, preferences }) =>
      apiFetch<CalendarPreferences>(`${calendarApiBasePath(workspaceId)}/preferences`, {
        method: "PUT",
        body: JSON.stringify(preferences),
      }),
    onSuccess: (data, { workspaceId }) => {
      queryClient.setQueryData(
        calendarPreferencesQueryOptions(apiFetch, workspaceId).queryKey,
        data,
      );
    },
  }));
}
export function connectCalendar(
  context: ClientOperationContext,
  input: { workspaceId: string; client: "web" | "desktop" },
) {
  const scope = captureClientOperation(context);
  return startCalendarConnection(scope.context.apiFetch, input.workspaceId, input.client);
}
export function disconnectCalendarConnection(
  context: ClientOperationContext,
  input: { connection: CalendarConnection },
) {
  return runClientMutation(context, input, ({ apiFetch, queryClient }) => ({
    mutationFn: ({ connection }) => disconnectCalendar(apiFetch, connection),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: calendarSourcesQueryKey }),
  }));
}

export type ExecuteCalendarMutationResult = Awaited<ReturnType<typeof executeCalendarMutation>>;
export type ReconcileCalendarWritesInput = Parameters<typeof reconcileCalendarWrites>[1];
export type ReconcileCalendarWritesResult = Awaited<ReturnType<typeof reconcileCalendarWrites>>;
export type SaveCalendarPreferencesInput = Parameters<typeof saveCalendarPreferences>[1];
export type SaveCalendarPreferencesResult = Awaited<ReturnType<typeof saveCalendarPreferences>>;
export type ConnectCalendarInput = Parameters<typeof connectCalendar>[1];
export type ConnectCalendarResult = Awaited<ReturnType<typeof connectCalendar>>;
export type DisconnectCalendarConnectionInput = Parameters<typeof disconnectCalendarConnection>[1];
export type DisconnectCalendarConnectionResult = Awaited<
  ReturnType<typeof disconnectCalendarConnection>
>;
