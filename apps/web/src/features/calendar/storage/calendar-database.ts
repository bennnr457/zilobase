import Dexie, { liveQuery, type EntityTable } from "dexie";
import type {
  CalendarCacheIdentity,
  CalendarRecord,
  CalendarEvent,
  CachedRange,
  PendingCalendarMutation,
  CalendarCacheStore,
} from "@zilobase/features/calendar";
import {
  applyCalendarRange as applyRange,
  readCalendarRangeCache as readRange,
  evictCalendarRanges as evictRanges,
  calendarBufferBudgetAvailable as bufferAvailable,
} from "@zilobase/features/calendar";
import { emitCalendarMetric } from "../metrics";
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

const stores = new WeakMap<CalendarDatabase, CalendarCacheStore>();
const databases = new WeakMap<CalendarCacheStore, CalendarDatabase>();
export function calendarCacheDatabase(store: CalendarCacheStore) {
  const database = databases.get(store);
  if (!database) throw new Error("Calendar storage belongs to another runtime");
  return database;
}
export function calendarCacheStore(database: CalendarDatabase): CalendarCacheStore {
  const existing = stores.get(database);
  if (existing) return existing;
  const tables = [
    database.calendars,
    database.events,
    database.ranges,
    database.pending,
    database.state,
  ];
  const store: CalendarCacheStore = {
    name: database.name,
    identity: database.identity,
    isOpen: () => database.isOpen(),
    readCalendars: () => database.calendars.toArray(),
    readEvents: (keys) => (keys ? database.events.bulkGet([...keys]) : database.events.toArray()),
    readRanges: (calendarId) =>
      calendarId === undefined
        ? database.ranges.toArray()
        : database.ranges.where("calendarId").equals(calendarId).toArray(),
    readRange: (key) => database.ranges.get(key),
    readPending: (eventKey) =>
      eventKey === undefined
        ? database.pending.toArray()
        : database.pending.where("eventKey").equals(eventKey).toArray(),
    readState: (key) => database.state.get(key),
    write: (changes) =>
      database.transaction("rw", tables, async () => {
        if (changes.calendars) {
          await database.calendars.clear();
          await database.calendars.bulkPut(changes.calendars);
        }
        if (changes.deleteEvents?.length) await database.events.bulkDelete(changes.deleteEvents);
        if (changes.events?.length) await database.events.bulkPut(changes.events);
        if (changes.deleteRanges?.length) await database.ranges.bulkDelete(changes.deleteRanges);
        if (changes.ranges?.length) await database.ranges.bulkPut(changes.ranges);
        for (const { key, patch } of changes.rangeUpdates ?? [])
          await database.ranges.update(key, patch);
        if (changes.addPending?.length) await database.pending.bulkAdd(changes.addPending);
        if (changes.pending?.length) await database.pending.bulkPut(changes.pending);
        for (const { id, patch } of changes.pendingUpdates ?? [])
          await database.pending.update(id, patch);
        if (changes.deletePending?.length) await database.pending.bulkDelete(changes.deletePending);
        if (changes.state?.length) await database.state.bulkPut(changes.state);
        if (changes.deleteState?.length) await database.state.bulkDelete(changes.deleteState);
      }),
    transaction: (mode, work) => database.transaction(mode, tables, () => work(store)),
    observe: (read, next, error) => {
      const subscription = liveQuery(() => read(store)).subscribe({ next, error });
      return () => subscription.unsubscribe();
    },
    related: () => [...openDatabases.values()].map(calendarCacheStore),
    withLock: (key, work, signal) =>
      typeof navigator !== "undefined" && navigator.locks
        ? navigator.locks.request(key, signal ? { signal } : {}, work)
        : work(),
  };
  stores.set(database, store);
  databases.set(store, database);
  return store;
}
export { calendarRangeKey } from "@zilobase/features/calendar";
export const applyCalendarRange = (
  database: CalendarDatabase,
  response: Parameters<typeof applyRange>[1],
) => applyRange(calendarCacheStore(database), response);
export const readCalendarRangeCache = (
  database: CalendarDatabase,
  calendarId: string,
  start: string,
  end: string,
) => readRange(calendarCacheStore(database), calendarId, start, end, emitCalendarMetric);
export const evictCalendarRanges = (database: CalendarDatabase, pinned: string[]) =>
  evictRanges(calendarCacheStore(database), pinned, emitCalendarMetric);
export const calendarBufferBudgetAvailable = (database: CalendarDatabase) =>
  bufferAvailable(calendarCacheStore(database));
