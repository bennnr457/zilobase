import { belongsToRange } from "./cache";
import { calendarEventKey } from "./model";
import type {
  CalendarEvent,
  CalendarEventWriteRequest,
  CalendarMutationResponse,
  PendingCalendarMutation,
} from "./contracts";
import type { CalendarCacheStore as CalendarDatabase } from "./storage";
import type { ApiFetcher } from "../shared/api-fetcher";
import {
  postCalendarMutation,
  definiteCalendarRejection,
  createPendingCalendarMutation,
  calendarMutationSettlement,
  type EventAction,
} from "./mutations";
import { readCalendarMutation } from "./queries";
async function presentEvent(
  database: CalendarDatabase,
  event: CalendarEvent | undefined,
  removedKey?: string,
) {
  if (removedKey) await database.write({ deleteEvents: [removedKey] });
  const key = event ? calendarEventKey(event) : undefined;
  if (event && key) await database.write({ events: [{ key, event }] });
  for (const range of await database.readRanges()) {
    const eventKeys = range.eventKeys.filter((k) => k !== removedKey && k !== key);
    if (event && key && belongsToRange(event, range)) eventKeys.push(key);
    await database.write({ ranges: [{ ...range, eventKeys }] });
  }
}
async function settle(
  database: CalendarDatabase,
  pending: PendingCalendarMutation,
  result: CalendarMutationResponse,
  current = () => database.isOpen(),
) {
  if (!current()) return;
  await database.transaction("rw", async (database) => {
    if (!current() || !(await database.readPending()).some((row) => row.id === pending.id)) return;
    if (!current()) return;
    const settlement = calendarMutationSettlement(pending, result);
    if (settlement) {
      await presentEvent(database, settlement.event, pending.eventKey);
      await database.write({ deletePending: [pending.id] });
    } else
      await database.write({
        pendingUpdates: [{ id: pending.id, patch: { status: "ambiguous" } }],
      });
  });
}
export async function runCalendarMutation(
  input: {
    database: CalendarDatabase;
    action: EventAction;
    event: CalendarEvent;
    write: CalendarEventWriteRequest;
    destination?: string;
    responseStatus?: "accepted" | "declined" | "tentative";
    isCurrent?: () => boolean;
  },
  transport: ApiFetcher,
) {
  const { database, event, action, write } = input,
    key = calendarEventKey(event);
  const current = () => database.isOpen() && (input.isCurrent?.() ?? true);
  const check = () => {
    if (!current()) throw new Error("Calendar operation scope expired");
  };
  check();
  const pending = createPendingCalendarMutation(
    action,
    event,
    write,
    action === "create" || action === "duplicate"
      ? undefined
      : (await database.readEvents([key]))[0]?.event,
  );
  await database.transaction("rw", async (database) => {
    check();
    if ((await database.readPending(key)).length)
      throw new Error(
        "This event has an unresolved change. Check its status before editing again.",
      );
    check();
    await database.write({ addPending: [pending] });
    await presentEvent(database, action === "delete" ? undefined : pending.optimistic, key);
    check();
  });
  try {
    check();
    const result = await postCalendarMutation(transport, database.identity, input);
    check();
    await settle(database, pending, result, current);
    return result;
  } catch (error) {
    if (!current()) throw error;
    const definite = definiteCalendarRejection(error);
    await settle(
      database,
      pending,
      {
        operationId: write.operationId,
        status: definite ? "failed" : "ambiguous",
      },
      current,
    );
    throw error;
  }
}
export async function reconcileCalendarMutations(
  database: CalendarDatabase,
  transport: ApiFetcher,
  isCurrent = () => database.isOpen(),
) {
  for (const pending of await database.readPending()) {
    try {
      const result = await readCalendarMutation(
        transport,
        database.identity.workspaceId,
        pending.id,
      );
      if (!isCurrent()) return;
      await settle(database, pending, result, isCurrent);
    } catch {
      return;
    }
  }
}
