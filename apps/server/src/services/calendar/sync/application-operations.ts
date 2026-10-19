import {
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import { requireCalendarBinding, requireCalendarMembership } from "../connections/ownership";
import { normalizeEvent } from "../provider/gateway";
import { createCalendarGateway } from "../provider/oauth";
import { readOwnedCalendarRange, searchOwnedCalendar, syncCalendarConnection } from "./operations";
import { readProviderCalendarStates } from "./provider-state";
import { calendarRangeSchema } from "./ranges";
import { calendarSearchSchema } from "./search";

export type SyncCalendarOperationInput = { workspaceId: string; bindingId: string };
export async function syncCalendarOperation(
  context: ServerOperationContext,
  operationInput: SyncCalendarOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  if (!context.authentication.user)
    throw new ServerOperationError({ message: "Authentication required." }, 401);
  const actor = context.authentication.user;
  requireOperationWorkspace(context, operationInput.workspaceId);
  await requireCalendarMembership(actor.id, operationInput.workspaceId);

  const { account, binding } = await requireCalendarBinding(
    context.authentication.user!.id,
    operationInput.workspaceId!,
    operationInput.bindingId,
  );
  return await syncCalendarConnection(account, binding, context.env);
}

export type ReadCalendarRangeOperationInput = {
  workspaceId: string;
  bindingId: string;
  query?: Record<string, string>;
  signal?: AbortSignal;
};
export async function readCalendarRangeOperation(
  context: ServerOperationContext,
  operationInput: ReadCalendarRangeOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  if (!context.authentication.user)
    throw new ServerOperationError({ message: "Authentication required." }, 401);
  const actor = context.authentication.user;
  requireOperationWorkspace(context, operationInput.workspaceId);
  await requireCalendarMembership(actor.id, operationInput.workspaceId);

  const { account, binding } = await requireCalendarBinding(
    context.authentication.user!.id,
    operationInput.workspaceId!,
    operationInput.bindingId,
  );
  const range = calendarRangeSchema.parse(operationInput.query);
  return await readOwnedCalendarRange(account, binding, range, context.env, operationInput.signal);
}

export type SearchCalendarOperationInput = {
  workspaceId: string;
  bindingId: string;
  query?: Record<string, string>;
  signal?: AbortSignal;
};
export async function searchCalendarOperation(
  context: ServerOperationContext,
  operationInput: SearchCalendarOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  if (!context.authentication.user)
    throw new ServerOperationError({ message: "Authentication required." }, 401);
  const actor = context.authentication.user;
  requireOperationWorkspace(context, operationInput.workspaceId);
  await requireCalendarMembership(actor.id, operationInput.workspaceId);

  const { account, binding } = await requireCalendarBinding(
    context.authentication.user!.id,
    operationInput.workspaceId!,
    operationInput.bindingId,
  );
  const input = calendarSearchSchema.parse(operationInput.query);
  return await searchOwnedCalendar(account, binding, input, context.env, operationInput.signal);
}

export type GetCalendarEventOperationInput = {
  workspaceId: string;
  bindingId: string;
  calendarId: string;
  eventId: string;
};
export async function getCalendarEventOperation(
  context: ServerOperationContext,
  operationInput: GetCalendarEventOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  if (!context.authentication.user)
    throw new ServerOperationError({ message: "Authentication required." }, 401);
  const actor = context.authentication.user;
  requireOperationWorkspace(context, operationInput.workspaceId);
  await requireCalendarMembership(actor.id, operationInput.workspaceId);

  const { account, binding } = await requireCalendarBinding(
    context.authentication.user!.id,
    operationInput.workspaceId!,
    operationInput.bindingId,
  );
  const gateway = await createCalendarGateway(context.env, account),
    calendarId = operationInput.calendarId;
  const raw = await gateway.request(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(operationInput.eventId)}`,
  );
  return {
    event: normalizeEvent(
      raw,
      { workspaceId: binding.workspaceId, bindingId: binding.id, calendarId },
      "UTC",
    ),
  };
}

export type ReadCalendarCatalogOperationInput = { workspaceId: string; bindingId: string };
export async function readCalendarCatalogOperation(
  context: ServerOperationContext,
  operationInput: ReadCalendarCatalogOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  if (!context.authentication.user)
    throw new ServerOperationError({ message: "Authentication required." }, 401);
  const actor = context.authentication.user;
  requireOperationWorkspace(context, operationInput.workspaceId);
  await requireCalendarMembership(actor.id, operationInput.workspaceId);

  const { account, binding } = await requireCalendarBinding(
    context.authentication.user!.id,
    operationInput.workspaceId!,
    operationInput.bindingId,
  );
  const states = await readProviderCalendarStates(account.id);
  return { calendars: states.map((state) => ({ ...state.data, bindingId: binding.id })) };
}
