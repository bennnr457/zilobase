import type { RuntimeEnv } from "../../../shared/config/config";
import { requireCalendarBinding } from "../connections/ownership";
import { CalendarProviderError } from "../provider/gateway";
import { createCalendarGateway } from "../provider/oauth";
import { readProviderCalendarState, readProviderCalendarStates } from "./provider-state";
import { calendarRangeSchema, readCalendarRange } from "./ranges";
import { calendarSearchSchema, searchCalendarEvents } from "./search";
import { refreshCalendarList } from "./sync";
type CalendarConnection = Awaited<ReturnType<typeof requireCalendarBinding>>;
export async function syncCalendarConnection(
  account: CalendarConnection["account"],
  binding: CalendarConnection["binding"],
  env: RuntimeEnv,
) {
  const gateway = await createCalendarGateway(env, account),
    calendars = await refreshCalendarList(account.id, binding.id, gateway, env);
  const states = await readProviderCalendarStates(account.id);
  return {
    calendars,
    revisions: Object.fromEntries(states.map((s) => [s.calendarId, s.revision])),
    pending: true,
  };
}

export async function readOwnedCalendarRange(
  account: CalendarConnection["account"],
  binding: CalendarConnection["binding"],
  range: ReturnType<typeof calendarRangeSchema.parse>,
  env: RuntimeEnv,
  signal?: AbortSignal,
) {
  const state = await readProviderCalendarState(account.id, range.calendarId);
  if (!state || state.data.permissions.freeBusyOnly)
    throw new CalendarProviderError(403, "calendar_unavailable");
  return await readCalendarRange(
    {
      ...range,
      accountId: account.id,
      bindingId: binding.id,
      workspaceId: binding.workspaceId,
      timeZone: state.data.timeZone,
      generation: state.generation,
      revision: state.revision,
    },
    await createCalendarGateway(env, account),
    signal,
  );
}

export async function searchOwnedCalendar(
  account: CalendarConnection["account"],
  binding: CalendarConnection["binding"],
  input: ReturnType<typeof calendarSearchSchema.parse>,
  env: RuntimeEnv,
  signal?: AbortSignal,
) {
  const state = await readProviderCalendarState(account.id, input.calendarId);
  if (!state?.data.permissions.read || state.data.permissions.freeBusyOnly)
    throw new CalendarProviderError(403, "calendar_unavailable");
  return await searchCalendarEvents(
    input,
    { workspaceId: binding.workspaceId, bindingId: binding.id },
    state.data,
    await createCalendarGateway(env, account),
  );
}
