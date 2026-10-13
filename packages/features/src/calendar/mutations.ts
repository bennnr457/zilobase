import type { ApiFetcher } from "../shared/api-fetcher";
import { ApiError } from "../shared/api-error";
import { calendarApiBasePath, calendarEventKey } from "./model";
import { calendarConnectionPath } from "./queries";
import type {
  CalendarEvent,
  CalendarEventWriteRequest,
  CalendarMutationResponse,
  CalendarScope,
  PendingCalendarMutation,
} from "./contracts";
export type EventAction = "create" | "update" | "delete" | "duplicate" | "move" | "rsvp";

export function createPendingCalendarMutation(
  action: EventAction,
  event: CalendarEvent,
  write: CalendarEventWriteRequest,
  cachedEvent: CalendarEvent | undefined,
): PendingCalendarMutation {
  return {
    id: write.operationId,
    eventKey: calendarEventKey(event),
    before: action === "create" || action === "duplicate" ? undefined : (cachedEvent ?? event),
    optimistic: action === "delete" ? undefined : { ...event, ...write.event },
    status: "pending",
  };
}

export function calendarMutationSettlement(
  pending: PendingCalendarMutation,
  result: CalendarMutationResponse,
) {
  if (result.status === "succeeded") return { event: result.event };
  if (result.status === "failed") return { event: pending.before };
  return null;
}
export function startCalendarConnection(
  apiFetch: ApiFetcher,
  workspaceId: string,
  client: "web" | "desktop",
) {
  return apiFetch<{ authorizationUrl: string }>(
    `${calendarApiBasePath(workspaceId)}/connections/google/start`,
    { method: "POST", body: JSON.stringify({ client }) },
  );
}
export function disconnectCalendar(apiFetch: ApiFetcher, scope: CalendarScope) {
  return apiFetch(calendarConnectionPath(scope), { method: "DELETE" });
}
export function postCalendarMutation(
  apiFetch: ApiFetcher,
  scope: CalendarScope,
  input: {
    action: EventAction;
    event: CalendarEvent;
    write: CalendarEventWriteRequest;
    destination?: string;
    responseStatus?: "accepted" | "declined" | "tentative";
  },
) {
  const { action, event, write } = input;
  const path = `${calendarConnectionPath(scope)}/calendars/${encodeURIComponent(event.calendarId)}/events${action === "create" ? "" : `/${encodeURIComponent(event.eventId)}/${action}`}`;
  return apiFetch<CalendarMutationResponse>(path, {
    method: "POST",
    body: JSON.stringify({
      ...write,
      destination: input.destination,
      responseStatus: input.responseStatus,
    }),
  });
}
export function definiteCalendarRejection(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![408, 429].includes(error.status)
  );
}
