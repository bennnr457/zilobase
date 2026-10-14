import {
  newerCalendarRevision,
  matchesCalendarCacheIdentity,
  calendarRangeMembership,
  pruneCalendarRangeMembership,
  calendarCachedCoverage,
  calendarRangeCacheStale,
  planCalendarCacheEviction,
} from "./cache";
import type { CalendarMetricName } from "./telemetry";
import { calendarEventKey } from "./model";
import { eventOverlaps } from "../calendar-layout/time";
import type { CalendarRangeResponse } from "./contracts";
import { calendarRangeKey, type CalendarCacheStore } from "./storage";
import { z } from "zod";
import { replaceEqualDeep, type QueryClient } from "@tanstack/react-query";
import { sharedClient, type SharedClient } from "../data/client";
import type { DataSession } from "../data/session";
import type { CalendarRecord, CalendarEvent, CachedRange } from "./contracts";

const liveCollections = new WeakMap<DataSession, Map<string, CalendarCollections>>();
export class CalendarCollections {
  private readonly latestReads = new Map<string, number>();
  readonly calendars;
  readonly events;
  readonly ranges;
  constructor(
    readonly session: DataSession,
    readonly bindingId: string,
  ) {
    this.calendars = session.register({
      name: `calendar:${bindingId}:calendars`,
      schema: z.object({ id: z.string(), calendar: z.custom<CalendarRecord>() }),
    });
    this.events = session.register({
      name: `calendar:${bindingId}:events`,
      schema: z.object({ id: z.string(), event: z.custom<CalendarEvent>() }),
    });
    this.ranges = session.register({
      name: `calendar:${bindingId}:ranges`,
      schema: z.object({ id: z.string(), range: z.custom<CachedRange>() }),
    });
  }
  publish(
    input: { calendars: CalendarRecord[]; events?: CalendarEvent[]; rangeRows?: CachedRange[] },
    sequence: number,
  ) {
    const clock = { scope: "actor" as const, id: `calendar:${this.bindingId}`, revision: sequence };
    this.session.ingest([
      this.calendars.stage(
        input.calendars
          .filter((calendar) =>
            this.changed(
              "calendar",
              calendar.id,
              calendar,
              this.calendars.get(calendar.id)?.calendar,
              sequence,
            ),
          )
          .map((calendar) => ({
            id: calendar.id,
            calendar: replaceEqualDeep(this.calendars.get(calendar.id)?.calendar, calendar),
          })),
        clock,
      ),
      this.events.stage(
        (input.events ?? [])
          .filter((event) =>
            this.changed(
              "event",
              calendarEventKey(event),
              event,
              this.events.get(calendarEventKey(event))?.event,
              sequence,
            ),
          )
          .map((event) => ({
            id: calendarEventKey(event),
            event: replaceEqualDeep(this.events.get(calendarEventKey(event))?.event, event),
          })),
        clock,
      ),
      this.ranges.stage(
        (input.rangeRows ?? [])
          .filter((range) =>
            this.changed("range", range.key, range, this.ranges.get(range.key)?.range, sequence),
          )
          .map((range) => ({ id: range.key, range })),
        clock,
      ),
    ]);
  }

  private changed(
    kind: string,
    id: string,
    incoming: unknown,
    previous: unknown,
    sequence: number,
  ) {
    const key = JSON.stringify([kind, id]);
    if (sequence < (this.latestReads.get(key) ?? 0)) return false;
    this.latestReads.set(key, sequence);
    // Unchanged receipts still retire older reads, without republishing every buffered event.
    return replaceEqualDeep(previous, incoming) !== previous;
  }
}

export function calendarCollections(
  queryClient: QueryClient,
  read: ReturnType<SharedClient["capture"]>,
  workspaceId: string,
  bindingId: string,
) {
  const session = sharedClient(queryClient).resolve(read, workspaceId).session;
  const scopes = liveCollections.get(session) ?? new Map<string, CalendarCollections>();
  liveCollections.set(session, scopes);
  let collections = scopes.get(bindingId);
  if (!collections) {
    collections = new CalendarCollections(session, bindingId);
    scopes.set(bindingId, collections);
  }
  return collections;
}

export type CalendarCatalogReference = {
  cacheId: string;
  bindingId: string;
  calendarIds: string[];
  calendarFamilies: string[];
};
export function normalizeCalendarCatalog(
  queryClient: QueryClient,
  read: ReturnType<SharedClient["capture"]>,
  workspaceId: string,
  bindingId: string,
  calendars: CalendarRecord[],
): CalendarCatalogReference {
  const collections = calendarCollections(queryClient, read, workspaceId, bindingId);
  collections.publish({ calendars }, read.sequence);
  return {
    cacheId: collections.session.id,
    bindingId,
    calendarIds: calendars.map((calendar) => calendar.id),
    calendarFamilies: [collections.calendars.registration.name],
  };
}
export function resolveCalendarCatalog(
  queryClient: QueryClient,
  reference: CalendarCatalogReference | undefined,
) {
  const session = reference && sharedClient(queryClient).get(reference.cacheId)?.session;
  const collections = session && liveCollections.get(session)?.get(reference.bindingId);
  if (!collections || !reference) return undefined;
  return {
    calendars: reference.calendarIds.flatMap((id) => {
      const row = collections.calendars.get(id);
      return row ? [row.calendar] : [];
    }),
  };
}

export async function applyCalendarRange(
  cache: CalendarCacheStore,
  response: CalendarRangeResponse,
) {
  if (!response.complete || response.nextPageToken) return false;
  return cache.transaction("rw", async (cache) => {
    const state = await cache.readState(response.calendarId);
    if (newerCalendarRevision(state, response)) return false;
    const key = calendarRangeKey(response.calendarId, response.start, response.end);
    if (newerCalendarRevision(await cache.readRange(key), response)) return false;
    const pendingRows = await cache.readPending();
    const pending = new Set(pendingRows.map((row) => row.eventKey));
    const events = response.events.filter((event) => event.status !== "cancelled");
    for (const event of events) {
      if (!matchesCalendarCacheIdentity(event, cache.identity, response.calendarId))
        throw new Error("Calendar response identity mismatch");
    }
    await cache.write({
      events: events.flatMap((event) => {
        const key = calendarEventKey(event);
        return pending.has(key) ? [] : [{ key, event }];
      }),
    });
    const incoming = new Set(events.map(calendarEventKey));
    for (const range of await cache.readRanges(response.calendarId)) {
      if (newerCalendarRevision(range, response)) continue;
      const rows = await cache.readEvents(range.eventKeys);
      const eventKeys = pruneCalendarRangeMembership(
        range.eventKeys,
        rows,
        pending,
        incoming,
        response,
      );
      if (eventKeys.length !== range.eventKeys.length)
        await cache.write({ rangeUpdates: [{ key: range.key, patch: { eventKeys } }] });
    }
    await cache.write({
      ranges: [
        {
          key,
          calendarId: response.calendarId,
          start: response.start,
          end: response.end,
          eventKeys: calendarRangeMembership(events, pendingRows, response),
          generation: response.generation,
          revision: response.revision,
          fetchedAt: Date.now(),
          accessedAt: Date.now(),
        },
      ],
      state: [
        { key: response.calendarId, generation: response.generation, revision: response.revision },
      ],
    });
    return true;
  });
}

export async function readCalendarRangeCache(
  cache: CalendarCacheStore,
  calendarId: string,
  start: string,
  end: string,
  metric: (name: CalendarMetricName, value: number) => void = () => {},
) {
  const { ranges, coveredUntil } = calendarCachedCoverage(
    await cache.readRanges(calendarId),
    start,
    end,
  );
  metric("cache_hit", coveredUntil >= Date.parse(end) ? 1 : 0);
  touchRanges(
    cache,
    ranges.map((range) => range.key),
  );
  const state = await cache.readState(calendarId);
  const calendar = (await cache.readCalendars()).find((calendar) => calendar.id === calendarId);
  const rows = await cache.readEvents([...new Set(ranges.flatMap((range) => range.eventKeys))]);
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
export function calendarBufferBudgetAvailable(cache: CalendarCacheStore) {
  return (
    (cacheBudgets.get(JSON.stringify([cache.identity.apiOrigin, cache.identity.userId])) ?? 0) <
    50 * 1024 * 1024
  );
}
export async function evictCalendarRanges(
  cache: CalendarCacheStore,
  pinnedKeys: string[],
  metric: (name: CalendarMetricName, value: number) => void = () => {},
) {
  retainedPins.set(cache.name, new Set(pinnedKeys));
  const related = cache
    .related()
    .filter(
      (other) =>
        other.isOpen() &&
        other.identity.apiOrigin === cache.identity.apiOrigin &&
        other.identity.userId === cache.identity.userId,
    );
  const snapshots = await Promise.all(
    related.map(async (other) => ({
      cache: other,
      scope: other.name,
      ranges: await other.readRanges(),
      events: (await other.readEvents()).flatMap((row) => (row ? [row] : [])),
      pending: await other.readPending(),
    })),
  );
  const plan = planCalendarCacheEviction(snapshots, retainedPins);
  const stores = new Map(snapshots.map(({ cache }) => [cache.name, cache]));
  for (const removal of plan.removals) {
    // Keep the existing range-then-event eviction order.
    if (removal.rangeKey)
      await stores.get(removal.scope)!.write({ deleteRanges: [removal.rangeKey] });
    await stores.get(removal.scope)!.write({ deleteEvents: removal.eventKeys });
  }
  cacheBudgets.set(JSON.stringify([cache.identity.apiOrigin, cache.identity.userId]), plan.bytes);
  metric("retained_bytes", plan.bytes);
}

const accessed = new Map<string, number>();
function touchRanges(cache: CalendarCacheStore, keys: string[]) {
  const now = Date.now();
  const pending = keys.filter((key) => now - (accessed.get(`${cache.name}:${key}`) ?? 0) > 60_000);
  if (!pending.length) return;
  for (const key of pending) accessed.set(`${cache.name}:${key}`, now);
  if (accessed.size > 4096) accessed.clear();
  setTimeout(() => {
    if (cache.isOpen())
      void cache
        .transaction("rw", async (cache) => {
          await cache.write({
            rangeUpdates: pending.map((key) => ({ key, patch: { accessedAt: now } })),
          });
        })
        .catch(() => {});
  }, 0);
}
