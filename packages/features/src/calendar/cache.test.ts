import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarCachedCoverage,
  calendarRangeCacheStale,
  calendarRangeMembership,
  composeCalendarCacheSnapshot,
  matchesCalendarCacheIdentity,
  newerCalendarRevision,
  planCalendarCacheEviction,
  pruneCalendarRangeMembership,
} from "./cache";
import { calendarEventKey, newCalendarEvent } from "./model";
import type { CachedRange } from "./contracts";

const start = "2026-10-12T00:00:00.000Z";
const end = "2026-10-13T00:00:00.000Z";
const now = 1_000_000;
const event = newCalendarEvent({
  workspaceId: "workspace",
  bindingId: "binding",
  calendarId: "calendar",
  date: "2026-10-12",
  timeZone: "UTC",
  hour: 9,
});
const key = calendarEventKey(event);
const range: CachedRange = {
  key: "range",
  calendarId: "calendar",
  start,
  end,
  eventKeys: [key],
  generation: 2,
  revision: 3,
  fetchedAt: now,
  accessedAt: 1,
};

test("calendar cache rejects older revisions and cross-binding events", () => {
  assert.equal(newerCalendarRevision({ generation: 3, revision: 1 }, range), true);
  assert.equal(newerCalendarRevision({ generation: 2, revision: 4 }, range), true);
  assert.equal(newerCalendarRevision({ generation: 1, revision: 99 }, range), false);
  assert.equal(newerCalendarRevision(range, range), false);
  const identity = {
    apiOrigin: "https://api.test",
    userId: "user",
    workspaceId: "workspace",
    bindingId: "binding",
  };
  assert.equal(matchesCalendarCacheIdentity(event, identity, "calendar"), true);
  assert.equal(
    matchesCalendarCacheIdentity(event, { ...identity, bindingId: "other" }, "calendar"),
    false,
  );
  assert.equal(matchesCalendarCacheIdentity(event, identity, "other"), false);
});

test("cache coverage stops at holes and retains revision and five minute staleness boundaries", () => {
  const coverage = calendarCachedCoverage([range], start, end);
  const stale = (state = { generation: 2, revision: 3 }, time = now) =>
    calendarRangeCacheStale(coverage.ranges, coverage.coveredUntil, end, state, time);
  assert.equal(stale(), false);
  assert.equal(stale({ generation: 2, revision: 4 }), true);
  assert.equal(stale({ generation: 3, revision: 1 }), true);
  assert.equal(stale(undefined, now + 300_000), false);
  assert.equal(stale(undefined, now + 300_001), true);
  assert.equal(
    calendarRangeCacheStale(coverage.ranges, coverage.coveredUntil, end, undefined, now),
    true,
  );
  const hole = calendarCachedCoverage(
    [
      { ...range, end: "2026-10-12T10:00:00.000Z" },
      { ...range, key: "later", start: "2026-10-12T11:00:00.000Z" },
    ],
    start,
    end,
  );
  assert.equal(hole.coveredUntil, Date.parse("2026-10-12T10:00:00.000Z"));
  assert.equal(calendarRangeCacheStale(hole.ranges, hole.coveredUntil, end, range, now), true);
});

test("authoritative ranges preserve pending moves and remove only overlapping stale membership", () => {
  const optimistic = {
    ...event,
    start: { dateTime: "2026-10-14T09:00:00Z", timeZone: "UTC" } as const,
    end: { dateTime: "2026-10-14T09:30:00Z", timeZone: "UTC" } as const,
  };
  const pending = [{ id: "move", eventKey: key, optimistic, status: "pending" as const }];
  assert.deepEqual(calendarRangeMembership([event], pending, range), []);
  assert.deepEqual(
    calendarRangeMembership([event], [{ ...pending[0]!, optimistic: event }], range),
    [key],
  );
  assert.deepEqual(
    pruneCalendarRangeMembership([key], [{ event }], new Set([key]), new Set(), range),
    [key],
  );
  assert.deepEqual(
    pruneCalendarRangeMembership([key], [{ event }], new Set(), new Set(), range),
    [],
  );
  assert.deepEqual(
    pruneCalendarRangeMembership([key], [{ event: optimistic }], new Set(), new Set(), range),
    [key],
  );
  assert.deepEqual(pruneCalendarRangeMembership([key], [undefined], new Set(), new Set(), range), [
    key,
  ]);
});

test("eviction removes orphans first, protects pins and pending writes, and keeps shared events", () => {
  const snapshots = [
    {
      scope: "account",
      ranges: [
        range,
        { ...range, key: "pinned", accessedAt: 2, eventKeys: ["pin", key] },
        { ...range, key: "pending", accessedAt: 3, eventKeys: ["pending"] },
        { ...range, key: "last", accessedAt: 4, eventKeys: ["last"] },
      ],
      events: [key, "orphan", "pin", "pending", "last"].map((key) => ({ key, event })),
      pending: [{ id: "write", eventKey: "pending", status: "ambiguous" as const }],
    },
  ];
  const before = structuredClone(snapshots);
  const result = planCalendarCacheEviction(
    snapshots,
    new Map([["account", new Set(["pinned"])]]),
    0,
  );
  assert.deepEqual(result.removals, [
    { scope: "account", eventKeys: ["orphan"] },
    { scope: "account", rangeKey: "range", eventKeys: [] },
    { scope: "account", rangeKey: "last", eventKeys: ["last"] },
  ]);
  assert.ok(result.bytes > 0, "protected data may exceed the budget");
  assert.deepEqual(snapshots, before);
});

test("cache snapshots deduplicate events and require complete coverage before loading", () => {
  const updated = { ...event, title: "Updated" };
  const results = [
    {
      calendarId: "calendar",
      coverage: [{ start, end }],
      ranges: [
        { events: [event], stale: false },
        { events: [updated], stale: true },
      ],
    },
  ];
  const snapshot = composeCalendarCacheSnapshot([], results, true, { start, end }, "request");
  assert.deepEqual(snapshot.events, [updated]);
  assert.equal(snapshot.loaded, true);
  assert.equal(snapshot.stale, true);
  assert.equal(
    composeCalendarCacheSnapshot([], results, false, { start, end }, "request").loaded,
    false,
  );
  assert.equal(
    composeCalendarCacheSnapshot(
      [],
      [{ ...results[0]!, coverage: [] }],
      true,
      { start, end },
      "request",
    ).loaded,
    false,
  );
});
