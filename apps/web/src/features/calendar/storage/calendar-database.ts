import {
  newerCalendarRevision,
  matchesCalendarCacheIdentity,
  calendarRangeMembership,
  pruneCalendarRangeMembership,
  calendarCachedCoverage,
  calendarRangeCacheStale,
  planCalendarCacheEviction,
  type CalendarCacheIdentity,
  type CachedRange,
  type PendingCalendarMutation,
} from "@zilobase/features/calendar";
import { emitCalendarMetric } from "../metrics";
import Dexie, { type EntityTable } from "dexie";
import {
  calendarEventKey,
  eventOverlaps,
  type CalendarEvent,
  type CalendarRecord,
  type CalendarRangeResponse,
} from "@zilobase/features/calendar";
export type {
  CalendarCacheIdentity,
  CachedRange,
  PendingCalendarMutation,
} from "@zilobase/features/calendar";
export class CalendarDatabase extends Dexie {
  calendars!: EntityTable<CalendarRecord, "id">;
  events!: EntityTable<{ key: string; event: CalendarEvent }, "key">;
  ranges!: EntityTable<CachedRange, "key">;
  pending!: EntityTable<PendingCalendarMutation, "id">;
  state!: EntityTable<{ key: string; generation: number; revision: number }, "key">;
  reminders!: EntityTable<{ key: string; expiresAt: number }, "key">;
  constructor(readonly identity: CalendarCacheIdentity) {
    super(calendarDatabaseName(identity));
    this.version(1).stores({
      calendars: "id",
      events: "key",
      ranges: "key, calendarId, accessedAt",
      pending: "id, eventKey",
      state: "key",
      reminders: "key, expiresAt",
    });
    this.on("versionchange", () => this.close());
  }
}
const openDatabases = new Map<string, CalendarDatabase>();
let lifecycle: BroadcastChannel | undefined;
export function calendarDatabaseName(identity: CalendarCacheIdentity) {
  const encode = (value: string) => {
    if (!value.trim()) throw new Error("Calendar cache identity required");
    return encodeURIComponent(value);
  };
  return `zilobase:v2:${encode(new URL(identity.apiOrigin).origin)}:${encode(identity.userId)}:workspace:${encode(identity.workspaceId)}:calendar:${encode(identity.bindingId)}`;
}
export async function openCalendarDatabase(identity: CalendarCacheIdentity) {
  if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" && !lifecycle) {
    lifecycle = new BroadcastChannel("zilobase:calendar:lifecycle");
    lifecycle.onmessage = (event) => {
      if (typeof event.data?.prefix === "string") closeMatching(event.data.prefix);
    };
  }
  const name = calendarDatabaseName(identity);
  let database = openDatabases.get(name);
  if (!database) {
    database = new CalendarDatabase(identity);
    openDatabases.set(name, database);
  }
  await database.open();
  return database;
}
function closeMatching(prefix: string) {
  for (const [name, database] of openDatabases)
    if (name.startsWith(prefix)) {
      database.close();
      openDatabases.delete(name);
    }
}
export async function prepareCalendarDatabasesForDeletion(prefix: string) {
  closeMatching(prefix);
  lifecycle?.postMessage({ prefix });
}
export async function destroyCalendarDatabase(name: string) {
  await prepareCalendarDatabasesForDeletion(name);
  await Dexie.delete(name);
}
export function calendarRangeKey(calendarId: string, start: string, end: string) {
  return JSON.stringify([calendarId, start, end]);
}
export async function applyCalendarRange(
  database: CalendarDatabase,
  response: CalendarRangeResponse,
) {
  if (!response.complete || response.nextPageToken) return false;
  return database.transaction(
    "rw",
    database.events,
    database.ranges,
    database.state,
    database.pending,
    async () => {
      const state = await database.state.get(response.calendarId);
      if (newerCalendarRevision(state, response)) return false;
      const key = calendarRangeKey(response.calendarId, response.start, response.end),
        prior = await database.ranges.get(key);
      if (newerCalendarRevision(prior, response)) return false;
      const pendingRows = await database.pending.toArray();
      const pending = new Set(pendingRows.map((row) => row.eventKey));
      const events = response.events.filter((event) => event.status !== "cancelled");
      for (const event of events) {
        if (!matchesCalendarCacheIdentity(event, database.identity, response.calendarId))
          throw new Error("Calendar response identity mismatch");
        const eventKey = calendarEventKey(event);
        if (!pending.has(eventKey)) await database.events.put({ key: eventKey, event });
      }
      // An authoritative absence must also leave older overlapping memberships.
      const incoming = new Set(events.map(calendarEventKey));
      const older = await database.ranges.where("calendarId").equals(response.calendarId).toArray();
      for (const range of older) {
        if (newerCalendarRevision(range, response)) continue;
        const rows = await database.events.bulkGet(range.eventKeys);
        const eventKeys = pruneCalendarRangeMembership(
          range.eventKeys,
          rows,
          pending,
          incoming,
          response,
        );
        if (eventKeys.length !== range.eventKeys.length)
          await database.ranges.update(range.key, { eventKeys });
      }
      await database.ranges.put({
        key,
        calendarId: response.calendarId,
        start: response.start,
        end: response.end,
        eventKeys: calendarRangeMembership(events, pendingRows, response),
        generation: response.generation,
        revision: response.revision,
        fetchedAt: Date.now(),
        accessedAt: Date.now(),
      });
      await database.state.put({
        key: response.calendarId,
        generation: response.generation,
        revision: response.revision,
      });
      return true;
    },
  );
}
export async function readCalendarRangeCache(
  database: CalendarDatabase,
  calendarId: string,
  start: string,
  end: string,
) {
  const { ranges, coveredUntil } = calendarCachedCoverage(
    await database.ranges.where("calendarId").equals(calendarId).toArray(),
    start,
    end,
  );
  emitCalendarMetric("cache_hit", coveredUntil >= Date.parse(end) ? 1 : 0);
  // Read all overlapping snapshots even when a hole separates cached windows.
  touchRanges(
    database,
    ranges.map((range) => range.key),
  );
  const state = await database.state.get(calendarId),
    calendar = await database.calendars.get(calendarId);
  const rows = await database.events.bulkGet([
    ...new Set(ranges.flatMap((range) => range.eventKeys)),
  ]);
  return {
    events: rows.flatMap((row) =>
      row && eventOverlaps(row.event, start, end, calendar?.timeZone ?? "UTC") ? [row.event] : [],
    ),
    loaded: coveredUntil >= Date.parse(end),
    stale: calendarRangeCacheStale(ranges, coveredUntil, end, state),
  };
}
const retainedPins = new Map<string, Set<string>>();
const cacheBudgets = new Map<string, number>();
export function calendarBufferBudgetAvailable(database: CalendarDatabase) {
  return (
    (cacheBudgets.get(JSON.stringify([database.identity.apiOrigin, database.identity.userId])) ??
      0) <
    50 * 1024 * 1024
  );
}
export async function evictCalendarRanges(database: CalendarDatabase, pinnedKeys: string[]) {
  retainedPins.set(database.name, new Set(pinnedKeys));
  const related = [...openDatabases.values()].filter(
    (db) =>
      db.isOpen() &&
      db.identity.apiOrigin === database.identity.apiOrigin &&
      db.identity.userId === database.identity.userId,
  );
  const snapshots = await Promise.all(
    related.map(async (db) => ({
      db,
      ranges: await db.ranges.toArray(),
      events: await db.events.toArray(),
      pending: await db.pending.toArray(),
    })),
  );
  const plan = planCalendarCacheEviction(
    snapshots.map(({ db, ...snapshot }) => ({ ...snapshot, scope: db.name })),
    retainedPins,
  );
  const databases = new Map(snapshots.map(({ db }) => [db.name, db]));
  for (const removal of plan.removals) {
    const db = databases.get(removal.scope)!;
    if (removal.rangeKey) await db.ranges.delete(removal.rangeKey);
    await db.events.bulkDelete(removal.eventKeys);
  }
  const bytes = plan.bytes;
  cacheBudgets.set(JSON.stringify([database.identity.apiOrigin, database.identity.userId]), bytes);
  emitCalendarMetric("retained_bytes", bytes);
}
const accessed = new Map<string, number>();
function touchRanges(database: CalendarDatabase, keys: string[]) {
  const now = Date.now();
  const pending = keys.filter(
    (key) => now - (accessed.get(`${database.name}:${key}`) ?? 0) > 60_000,
  );
  if (!pending.length) return;
  for (const key of pending) accessed.set(`${database.name}:${key}`, now);
  if (accessed.size > 4096) accessed.clear();
  setTimeout(() => {
    if (database.isOpen())
      void database
        .transaction("rw", database.ranges, async () => {
          for (const key of pending) await database.ranges.update(key, { accessedAt: now });
        })
        .catch(() => {});
  }, 0);
}
