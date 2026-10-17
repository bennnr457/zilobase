import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryCalendarStorage } from "./memory-storage";
import { newCalendarEvent, calendarEventKey } from "./model";
import { runCalendarMutation, reconcileCalendarMutations } from "./commands";
import type { ApiFetcher } from "../shared/api-fetcher";
import type { CalendarMutationResponse } from "./contracts";
import { calendarDays, shiftCalendarPeriod } from "../calendar-layout/time";
import { normalizeCalendarView } from "../calendar-layout/types";

const identity = {
  apiOrigin: "https://calendar.test",
  userId: "user",
  workspaceId: "workspace",
  bindingId: "binding",
};
const event = newCalendarEvent({
  ...identity,
  calendarId: "primary",
  date: "2026-10-17",
  timeZone: "UTC",
  hour: 9,
});

test("runtime-only calendar storage isolates sources, publishes commits and rolls back failed transactions", async () => {
  const storage = createMemoryCalendarStorage();
  const store = await storage.open(identity);
  const other = await storage.open({ ...identity, bindingId: "other" });
  assert.equal(store.persistent, false);
  const values: number[] = [];
  const stop = store.observe<Awaited<ReturnType<typeof store.readEvents>>>(
    (tx) => tx.readEvents(),
    (rows) => values.push(rows.length),
    (error) => {
      throw error;
    },
  );
  await store.write({ events: [{ key: calendarEventKey(event), event }] });
  await assert.rejects(
    store.transaction("rw", async (tx) => {
      await tx.write({ deleteEvents: [calendarEventKey(event)] });
      throw new Error("rollback");
    }),
    /rollback/,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await store.readEvents()).length, 1);
  assert.equal((await other.readEvents()).length, 0);
  assert.equal(values.at(-1), 1);
  stop();
  await storage.clear(identity);
  assert.equal(store.isOpen(), false);
  assert.equal((await (await storage.open(identity)).readEvents()).length, 0);
  storage.dispose();
  assert.equal(other.isOpen(), false);
});

test("late results cannot settle another scope, while the original intention remains reconcilable", async () => {
  const storage = createMemoryCalendarStorage(),
    store = await storage.open(identity);
  const receipt = Promise.withResolvers<CalendarMutationResponse>();
  let current = true;
  const operation = runCalendarMutation(
    {
      database: store,
      event,
      action: "create",
      write: { operationId: "one", event, sendUpdates: "none" },
      isCurrent: () => current,
    },
    (async () => receipt.promise) as ApiFetcher,
  );
  await new Promise((resolve) => setImmediate(resolve));
  current = false;
  receipt.resolve({
    operationId: "one",
    status: "succeeded",
    event: { ...event, eventId: "provider" },
  });
  await assert.rejects(operation, /scope expired/);
  assert.equal((await store.readPending()).length, 1);
  assert.equal((await store.readEvents())[0]?.event.eventId, event.eventId);
  await reconcileCalendarMutations(store, (async () => ({
    operationId: "one",
    status: "succeeded",
    event: { ...event, eventId: "provider" },
  })) as ApiFetcher);
  assert.equal((await store.readPending()).length, 0);
  assert.equal((await store.readEvents())[0]?.event.eventId, "provider");
  storage.dispose();
});

test("Agenda uses thirty civil days including daylight-saving transitions", () => {
  assert.equal(normalizeCalendarView("agenda"), "agenda");
  assert.equal(calendarDays("2026-10-17", "agenda", 1).length, 30);
  assert.equal(calendarDays("2026-10-17", "agenda", 1).at(-1), "2026-11-15");
  assert.equal(shiftCalendarPeriod("2026-10-17", "agenda", 1), "2026-11-16");
  assert.equal(shiftCalendarPeriod("2026-11-16", "agenda", -1), "2026-10-17");
});
