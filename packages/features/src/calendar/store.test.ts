import assert from "node:assert/strict";
import test from "node:test";
import { createZilobaseClient } from "../shared/client";
import type { CalendarCacheSnapshot } from "../shared/cache-storage";
import type { CalendarCacheStore } from "./storage";
import { applyCalendarRange, calendarCollections, resolveCalendarCatalog } from "./store";
import { runCalendarMutation, reconcileCalendarMutations } from "./commands";
import { calendarCatalogQueryOptions } from "./queries";
import { newCalendarEvent, calendarEventKey } from "./model";
import { sharedClient } from "../data/client";
import { ApiError } from "../shared/api-error";
import type { ApiFetcher } from "../shared/api-fetcher";
import type { CalendarMutationResponse } from "./contracts";

function fixture() {
  let state: CalendarCacheSnapshot = {
    calendars: [],
    events: [],
    ranges: [],
    pending: [],
    state: [],
  };
  let failWrites = false;
  const replace = <T>(rows: T[], changes: T[] | undefined, key: (row: T) => string) => {
    for (const value of changes ?? []) {
      const index = rows.findIndex((row) => key(row) === key(value));
      if (index === -1) rows.push(value);
      else rows[index] = value;
    }
  };
  const cache: CalendarCacheStore = {
    name: "native-fixture",
    identity: {
      apiOrigin: "https://server.test",
      userId: "user",
      workspaceId: "workspace",
      bindingId: "binding",
    },
    isOpen: () => true,
    readCalendars: async () => state.calendars,
    readEvents: async (keys) =>
      keys ? keys.map((key) => state.events.find((row) => row.key === key)) : state.events,
    readRanges: async (id) =>
      id === undefined ? state.ranges : state.ranges.filter((row) => row.calendarId === id),
    readRange: async (key) => state.ranges.find((row) => row.key === key),
    readPending: async (key) =>
      key === undefined ? state.pending : state.pending.filter((row) => row.eventKey === key),
    readState: async (key) => state.state.find((row) => row.key === key),
    write: async (patch) => {
      if (failWrites) throw new Error("storage failure");
      if (patch.calendars) state.calendars = patch.calendars;
      state.events = state.events.filter((row) => !patch.deleteEvents?.includes(row.key));
      state.ranges = state.ranges.filter((row) => !patch.deleteRanges?.includes(row.key));
      state.pending = state.pending.filter((row) => !patch.deletePending?.includes(row.id));
      state.state = state.state.filter((row) => !patch.deleteState?.includes(row.key));
      replace(state.events, patch.events, (row) => row.key);
      replace(state.ranges, patch.ranges, (row) => row.key);
      replace(state.pending, patch.addPending, (row) => row.id);
      replace(state.pending, patch.pending, (row) => row.id);
      for (const { id, patch: changes } of patch.pendingUpdates ?? []) {
        const row = state.pending.find((row) => row.id === id);
        if (row) Object.assign(row, changes);
      }
      replace(state.state, patch.state, (row) => row.key);
      for (const { key, patch: changes } of patch.rangeUpdates ?? []) {
        const row = state.ranges.find((row) => row.key === key);
        if (row) Object.assign(row, changes);
      }
    },
    transaction: async (_mode, work) => {
      const before = structuredClone(state);
      try {
        return await work(cache);
      } catch (error) {
        state = before;
        throw error;
      }
    },
    observe: () => () => {},
    related: () => [cache],
  };
  const event = newCalendarEvent({
    workspaceId: "workspace",
    bindingId: "binding",
    calendarId: "calendar",
    date: "2026-10-14",
    timeZone: "UTC",
    hour: 9,
  });
  return {
    cache,
    event,
    failWrites: () => {
      failWrites = true;
    },
  };
}

test("calendar catalog reads publish references to shared DB and expire with the runtime identity", async () => {
  const runtime = createZilobaseClient({ deployment: "https://server.test" });
  const calendar = { id: "calendar", bindingId: "binding", name: "Original" };
  try {
    const reference = await runtime.queryClient.fetchQuery(
      calendarCatalogQueryOptions(
        (async () => ({ calendars: [calendar] })) as ApiFetcher,
        { workspaceId: "workspace", bindingId: "binding" } as never,
      ),
    );
    assert.equal("calendars" in reference, false);
    assert.equal(
      resolveCalendarCatalog(runtime.queryClient, reference)?.calendars[0].name,
      "Original",
    );
    const data = sharedClient(runtime.queryClient);
    const read = data.capture();
    calendarCollections(runtime.queryClient, read, "workspace", "binding").publish(
      { calendars: [{ ...calendar, name: "Confirmed" } as never] },
      read.sequence,
    );
    assert.equal(
      resolveCalendarCatalog(runtime.queryClient, reference)?.calendars[0].name,
      "Confirmed",
    );
    runtime.queryClient.setQueryData(["session"], {
      user: { id: "other" },
      session: { id: "other" },
    });
    assert.equal(resolveCalendarCatalog(runtime.queryClient, reference), undefined);
  } finally {
    runtime.dispose();
  }
});

test("calendar atomic storage rejects stale revisions and rolls back an identity mismatch", async () => {
  const { cache, event } = fixture();
  const response = {
    calendarId: event.calendarId,
    start: "2026-10-14T00:00:00Z",
    end: "2026-10-15T00:00:00Z",
    generation: 1,
    revision: 2,
    complete: true,
    nextPageToken: null,
    events: [event],
  };
  assert.equal(await applyCalendarRange(cache, response), true);
  assert.equal(await applyCalendarRange(cache, { ...response, revision: 1, events: [] }), false);
  await assert.rejects(
    applyCalendarRange(cache, {
      ...response,
      revision: 3,
      events: [event, { ...event, eventId: "other", bindingId: "another" }],
    }),
    /identity mismatch/,
  );
  assert.equal((await cache.readState(event.calendarId))?.revision, 2);
  assert.equal((await cache.readEvents()).length, 1);
});

test("native storage preserves ambiguous intentions across restart reconciliation and blocks repeated edits", async () => {
  const { cache, event } = fixture();
  await cache.write({ events: [{ key: calendarEventKey(event), event }] });
  const input = {
    database: cache,
    action: "update" as const,
    event,
    write: { operationId: "operation", event: { title: "Edited" }, sendUpdates: "all" as const },
  };
  const unavailable = (async () => {
    throw new TypeError("offline");
  }) as ApiFetcher;
  await assert.rejects(runCalendarMutation(input, unavailable), /offline/);
  assert.equal((await cache.readPending())[0].status, "ambiguous");
  assert.equal((await cache.readEvents())[0]?.event.title, "Edited");
  await assert.rejects(
    runCalendarMutation(
      { ...input, write: { ...input.write, operationId: "another" } },
      unavailable,
    ),
    /unresolved change/,
  );
  await applyCalendarRange(cache, {
    calendarId: event.calendarId,
    start: "2026-10-14T00:00:00Z",
    end: "2026-10-15T00:00:00Z",
    generation: 1,
    revision: 10,
    complete: true,
    nextPageToken: null,
    events: [event],
  });
  assert.equal((await cache.readEvents())[0]?.event.title, "Edited");
  await reconcileCalendarMutations(cache, (async () => ({
    operationId: "operation",
    status: "succeeded",
    event: { ...event, title: "Confirmed" },
  })) as ApiFetcher);
  assert.equal((await cache.readPending()).length, 0);
  assert.equal((await cache.readEvents())[0]?.event.title, "Confirmed");
});

test("definite calendar rejection rolls back while a failed durable preview never reaches the API", async () => {
  const { cache, event, failWrites } = fixture();
  await cache.write({ events: [{ key: calendarEventKey(event), event }] });
  const input = {
    database: cache,
    action: "update" as const,
    event,
    write: { operationId: "operation", event: { title: "Edited" }, sendUpdates: "all" as const },
  };
  await assert.rejects(
    runCalendarMutation(input, (async () => {
      throw new ApiError("conflict", 409, {});
    }) as ApiFetcher),
    /conflict/,
  );
  assert.equal((await cache.readPending()).length, 0);
  assert.equal((await cache.readEvents())[0]?.event.title, event.title);
  failWrites();
  let requests = 0;
  await assert.rejects(
    runCalendarMutation(input, (async () => {
      requests++;
      return {};
    }) as ApiFetcher),
    /storage failure/,
  );
  assert.equal(requests, 0);
  assert.equal((await cache.readPending()).length, 0);
});

test("unchanged calendar receipts reject older reads and publish related entities coherently", async () => {
  const runtime = createZilobaseClient({ deployment: "server" });
  const { event } = fixture();
  try {
    const collections = calendarCollections(
      runtime.queryClient,
      sharedClient(runtime.queryClient).capture(),
      "workspace",
      "binding",
    );
    await collections.session.ready();
    const calendar = {
      id: event.calendarId,
      bindingId: "binding",
      name: "Original",
      timeZone: "UTC",
      colorId: null,
      primary: true,
      permissions: { read: true, write: true, owner: true, freeBusyOnly: false },
      defaultReminders: [],
    };
    const original = { calendars: [calendar], events: [{ ...event, title: "Original" }] };
    collections.publish(original, 1);
    const observations: string[] = [];
    const stop = collections.session.publication.subscribe(() => {
      observations.push(
        `${collections.calendars.get(event.calendarId)?.calendar.name}/${collections.events.get(calendarEventKey(event))?.event.title}`,
      );
    });
    try {
      collections.publish(original, 3);
      collections.publish(
        { calendars: [{ ...calendar, name: "Stale" }], events: [{ ...event, title: "Stale" }] },
        2,
      );
      assert.equal(collections.events.get(calendarEventKey(event))?.event.title, "Original");
      collections.publish(
        {
          calendars: [{ ...calendar, name: "Confirmed" }],
          events: [{ ...event, title: "Confirmed" }],
        },
        4,
      );
      assert.equal(observations.at(-1), "Confirmed/Confirmed");
      assert(
        observations.every((value) => ["Original/Original", "Confirmed/Confirmed"].includes(value)),
      );
    } finally {
      stop();
    }
  } finally {
    runtime.dispose();
  }
});

test("an ambiguous late receipt cannot resurrect an intention already confirmed by reconciliation", async () => {
  const { cache, event } = fixture();
  await cache.write({ events: [{ key: calendarEventKey(event), event }] });
  const receipt = Promise.withResolvers<CalendarMutationResponse>();
  const operation = runCalendarMutation(
    {
      database: cache,
      action: "update",
      event,
      write: { operationId: "operation", event: { title: "Edited" }, sendUpdates: "all" },
    },
    (async () => receipt.promise) as ApiFetcher,
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal((await cache.readPending()).length, 1);
  await reconcileCalendarMutations(cache, (async () => ({
    operationId: "operation",
    status: "succeeded",
    event: { ...event, title: "Confirmed" },
  })) as ApiFetcher);
  receipt.resolve({ operationId: "operation", status: "ambiguous" });
  await operation;
  assert.equal((await cache.readPending()).length, 0);
  assert.equal((await cache.readEvents())[0]?.event.title, "Confirmed");
});
