import { readableCalendar, freshCalendarRange } from "./cache";
import { calendarRequestRanges, missingCalendarRanges } from "./coverage";
import { synchronizeCalendar, calendarCatalog, readCalendarRange } from "./queries";
import { requestCalendarIntervals } from "./range-queue";
import { runCalendarSyncOnce } from "./sync-queue";
import { applyCalendarRange, calendarBufferBudgetAvailable, evictCalendarRanges } from "./store";
import { calendarRangeKey, type CalendarCacheStore as CalendarDatabase } from "./storage";
import type { CalendarRangeResponse, CalendarSyncResponse } from "./contracts";
import type { CalendarMetricName } from "./telemetry";
type Transport = <T>(path: string, options?: RequestInit) => Promise<T>;
export async function synchronizeCalendarCache(
  database: CalendarDatabase,
  start: string,
  end: string,
  fetcher: Transport,
  recover = true,
  options: {
    missingOnly?: boolean;
    priority?: number;
    metadataLoaded?: boolean;
    hiddenKeys?: string[];
    requestId?: string;
    isCurrent?: () => boolean;
    signal?: AbortSignal;
    accountId?: string;
    onMetric?: (name: CalendarMetricName, value: number) => void;
  } = {},
) {
  return (async () => {
    if (options.isCurrent && !options.isCurrent()) return;
    let sync: Pick<CalendarSyncResponse, "calendars"> = {
      calendars: await database.readCalendars(),
    };
    const storeMetadata = async () => {
      await database.transaction("rw", async (database) => {
        const current = new Set(sync.calendars.map((calendar) => calendar.id));
        for (const old of await database.readCalendars()) {
          if (!current.has(old.id)) {
            await database.write({
              deleteRanges: (await database.readRanges(old.id)).map((range) => range.key),
              deleteState: [old.id],
              deleteEvents: (await database.readEvents()).flatMap((row) =>
                row?.event.calendarId === old.id ? [row.key] : [],
              ),
            });
          }
        }
        await database.write({ calendars: sync.calendars });
      });
    };
    const recoverMetadata = async () => {
      const last = await database.readState("last_recovery");
      if (last && Date.now() - last.revision < 15_000) {
        sync = { calendars: await database.readCalendars() };
        return;
      }
      sync = await synchronizeCalendar(fetcher, database.identity);
      if (!database.isOpen()) return;
      await storeMetadata();
      await database.write({
        state: [{ key: "last_recovery", revision: Date.now(), generation: 1 }],
      });
    };
    await runCalendarSyncOnce(
      database.name,
      JSON.stringify(["metadata", recover, options.metadataLoaded]),
      async () => {
        if (recover) {
          if (database.withLock)
            await database.withLock(`${database.name}:provider-recovery`, recoverMetadata);
          else await recoverMetadata();
        } else if (!options.metadataLoaded) {
          sync = await calendarCatalog(fetcher, database.identity);
          if (!database.isOpen()) return;
          await storeMetadata();
        }
        if (!database.isOpen()) return;
      },
      options.priority,
    );
    const pinned: string[] = [];
    sync = { calendars: await database.readCalendars() };
    await Promise.all(
      sync.calendars
        .filter((c) => readableCalendar(c, options.hiddenKeys, database.identity.bindingId))
        .map((calendar) =>
          syncCalendarRanges(database, calendar, start, end, fetcher, options, pinned),
        ),
    );
    await evictCalendarRanges(database, pinned, options.onMetric);
  })();
}

async function syncCalendarRanges(
  database: CalendarDatabase,
  calendar: { id: string },
  start: string,
  end: string,
  fetcher: Transport,
  options: {
    missingOnly?: boolean;
    priority?: number;
    isCurrent?: () => boolean;
    accountId?: string;
    onMetric?: (name: CalendarMetricName, value: number) => void;
    signal?: AbortSignal;
    hiddenKeys?: string[];
  },
  pinned: string[],
) {
  const cached = await database.readRanges(calendar.id);
  const dense = await database.readState(`density:${calendar.id}`);
  const requested = options.missingOnly
    ? missingCalendarRanges(start, end, cached)
    : [{ start, end }];
  pinned.push(
    ...cached
      .filter((r) => Date.parse(r.start) < Date.parse(end) && Date.parse(r.end) > Date.parse(start))
      .map((r) => r.key),
  );
  for (const request of requested)
    await requestCalendarChunks(database, calendar, request, dense, fetcher, options, pinned);
}
async function requestCalendarChunks(
  database: CalendarDatabase,
  calendar: { id: string },
  request: { start: string; end: string },
  dense: { revision?: number } | undefined,
  fetcher: Transport,
  options: {
    priority?: number;
    isCurrent?: () => boolean;
    accountId?: string;
    onMetric?: (name: CalendarMetricName, value: number) => void;
    signal?: AbortSignal;
    missingOnly?: boolean;
  },
  pinned: string[],
) {
  for (const range of calendarRequestRanges(request.start, request.end, dense?.revision ? 7 : 28)) {
    if (shouldStopCalendarChunks(options, database)) return;
    await requestCalendarIntervals(
      `${database.name}:${calendar.id}`,
      JSON.stringify([
        database.identity.apiOrigin,
        database.identity.userId,
        options.accountId ?? database.identity.bindingId,
      ]),
      range,
      (span, signal) =>
        loadLockedCalendarRange(database, calendar.id, fetcher, options, span, signal),
      options.priority,
      options.signal,
      (count) => options.onMetric?.("duplicate_read", count),
    );
    pinned.push(calendarRangeKey(calendar.id, range.start, range.end));
  }
}
function shouldStopCalendarChunks(
  options: { isCurrent?: () => boolean; priority?: number },
  database: CalendarDatabase,
) {
  if (options.isCurrent && !options.isCurrent()) return true;
  return (options.priority ?? 0) < 10 && !calendarBufferBudgetAvailable(database);
}
async function loadLockedCalendarRange(
  database: CalendarDatabase,
  calendarId: string,
  fetcher: Transport,
  options: { missingOnly?: boolean; onMetric?: (name: CalendarMetricName, value: number) => void },
  span: { start: string; end: string },
  signal: AbortSignal,
) {
  const load = () => loadCalendarRangePages(database, calendarId, fetcher, options, span, signal);
  if (database.withLock)
    await database.withLock(
      `${database.name}:range:${calendarId}:${span.start}:${span.end}`,
      load,
      signal,
    );
  else await load();
}

async function loadCalendarRangePages(
  database: CalendarDatabase,
  calendarId: string,
  fetcher: Transport,
  options: { missingOnly?: boolean; onMetric?: (name: CalendarMetricName, value: number) => void },
  span: { start: string; end: string },
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const covered = await database.readRanges(calendarId);
  if (options.missingOnly && !missingCalendarRanges(span.start, span.end, covered).length) return;
  const prior = await database.readRange(calendarRangeKey(calendarId, span.start, span.end));
  const state = await database.readState(calendarId);
  if (freshCalendarRange(prior, state)) return;
  let pageToken: string | null = null,
    pages = 0;
  do {
    const response: CalendarRangeResponse = await readCalendarRange(
      fetcher,
      database.identity,
      {
        calendarId,
        start: span.start,
        end: span.end,
        ...(pageToken ? { pageToken } : {}),
      },
      signal,
    );
    if (!database.isOpen()) return;
    pages++;
    if (pages > 1)
      await database.write({
        state: [{ key: `density:${calendarId}`, revision: 1, generation: 1 }],
      });
    await applyCalendarRange(database, response);
    pageToken = response.nextPageToken;
    signal.throwIfAborted();
  } while (pageToken);
  options.onMetric?.("range_pages", pages);
}
