import { calendarEventKey } from "./model";
import { coversCalendarRange, type CalendarWindow } from "./coverage";
import type {
  CalendarEvent,
  CalendarCacheIdentity,
  CachedRange,
  PendingCalendarMutation,
  CalendarRecord,
} from "./contracts";
import { eventOverlaps } from "../calendar-layout/time";

export function readableCalendar(
  calendar: { permissions: { read: boolean; freeBusyOnly: boolean }; id: string },
  hiddenKeys: string[] | undefined,
  bindingId: string,
) {
  return (
    calendar.permissions.read &&
    !calendar.permissions.freeBusyOnly &&
    !hiddenKeys?.includes(JSON.stringify([bindingId, calendar.id]))
  );
}
export function freshCalendarRange(
  prior: { fetchedAt: number; revision: number; generation: number } | undefined,
  state: { revision: number; generation: number } | undefined,
) {
  return Boolean(
    prior &&
    Date.now() - prior.fetchedAt < 2000 &&
    (!state || (state.revision <= prior.revision && state.generation <= prior.generation)),
  );
}

export function belongsToRange(
  event: CalendarEvent,
  range: { calendarId: string; start: string; end: string },
) {
  return (
    range.calendarId === event.calendarId &&
    eventOverlaps(event, range.start, range.end, event.start.timeZone ?? "UTC")
  );
}

export function newerCalendarRevision(
  prior: { generation: number; revision: number } | undefined,
  incoming: { generation: number; revision: number },
) {
  return Boolean(
    prior &&
    (prior.generation > incoming.generation ||
      (prior.generation === incoming.generation && prior.revision > incoming.revision)),
  );
}
export function matchesCalendarCacheIdentity(
  event: CalendarEvent,
  identity: CalendarCacheIdentity,
  calendarId: string,
) {
  return (
    event.workspaceId === identity.workspaceId &&
    event.bindingId === identity.bindingId &&
    event.calendarId === calendarId
  );
}

export function pruneCalendarRangeMembership(
  eventKeys: string[],
  rows: ({ event: CalendarEvent } | undefined)[],
  pending: ReadonlySet<string>,
  incoming: ReadonlySet<string>,
  range: CalendarWindow,
) {
  return eventKeys.filter((eventKey, index) => {
    const event = rows[index]?.event;
    return (
      pending.has(eventKey) ||
      incoming.has(eventKey) ||
      !event ||
      !eventOverlaps(event, range.start, range.end, event.start.timeZone ?? "UTC")
    );
  });
}

export function calendarRangeMembership(
  events: CalendarEvent[],
  pendingRows: PendingCalendarMutation[],
  range: CalendarWindow & { calendarId: string },
) {
  const pending = new Set(pendingRows.map((row) => row.eventKey));
  return [
    ...new Set([
      ...events.map(calendarEventKey).filter((key) => !pending.has(key)),
      ...pendingRows
        .filter(
          (row) =>
            row.optimistic?.calendarId === range.calendarId &&
            eventOverlaps(
              row.optimistic,
              range.start,
              range.end,
              row.optimistic.start.timeZone ?? "UTC",
            ),
        )
        .map((row) => row.eventKey),
    ]),
  ];
}

export function calendarCachedCoverage(cached: CachedRange[], start: string, end: string) {
  const candidates = cached
    .filter(
      (row) => Date.parse(row.start) < Date.parse(end) && Date.parse(row.end) > Date.parse(start),
    )
    .sort(
      (a, b) => Date.parse(a.start) - Date.parse(b.start) || Date.parse(b.end) - Date.parse(a.end),
    );
  let coveredUntil = Date.parse(start);
  const selected: CachedRange[] = [];
  for (const range of candidates) {
    if (Date.parse(range.end) <= coveredUntil) continue;
    if (Date.parse(range.start) > coveredUntil) break;
    selected.push(range);
    coveredUntil = Date.parse(range.end);
    if (coveredUntil >= Date.parse(end)) break;
  }
  return { ranges: candidates, coveredUntil };
}

export function calendarRangeCacheStale(
  ranges: CachedRange[],
  coveredUntil: number,
  end: string,
  state: { generation: number; revision: number } | undefined,
  now = Date.now(),
) {
  return (
    coveredUntil < Date.parse(end) ||
    !state ||
    ranges.some(
      (range) =>
        state.generation !== range.generation ||
        state.revision > range.revision ||
        now - range.fetchedAt > 300_000,
    )
  );
}

export function planCalendarCacheEviction(
  cached: {
    scope: string;
    ranges: CachedRange[];
    events: { key: string; event: CalendarEvent }[];
    pending: PendingCalendarMutation[];
  }[],
  retainedPins: ReadonlyMap<string, ReadonlySet<string>>,
  budget = 50 * 1024 * 1024,
) {
  const snapshots = cached.map((snapshot) => ({
    ...snapshot,
    ranges: [...snapshot.ranges],
    events: [...snapshot.events],
  }));
  const removals: { scope: string; rangeKey?: string; eventKeys: string[] }[] = [];
  for (const snapshot of snapshots) {
    const retained = new Set([
      ...snapshot.ranges.flatMap((range) => range.eventKeys),
      ...snapshot.pending.map((row) => row.eventKey),
    ]);
    const orphaned = snapshot.events.filter((row) => !retained.has(row.key));
    if (orphaned.length)
      removals.push({ scope: snapshot.scope, eventKeys: orphaned.map((row) => row.key) });
    snapshot.events = snapshot.events.filter((row) => retained.has(row.key));
  }
  const encoder = new TextEncoder();
  let bytes = snapshots.reduce(
    (sum, snapshot) => sum + encoder.encode(JSON.stringify(snapshot.events)).byteLength,
    0,
  );
  const candidates = snapshots
    .flatMap((snapshot) => snapshot.ranges.map((range) => ({ snapshot, range })))
    .sort((a, b) => a.range.accessedAt - b.range.accessedAt);
  for (const { snapshot, range } of candidates) {
    if (bytes <= budget) break;
    if (
      retainedPins.get(snapshot.scope)?.has(range.key) ||
      snapshot.pending.some((row) => range.eventKeys.includes(row.eventKey))
    )
      continue;

    snapshot.ranges = snapshot.ranges.filter((row) => row.key !== range.key);
    const retained = new Set([
      ...snapshot.ranges.flatMap((row) => row.eventKeys),
      ...snapshot.pending.map((row) => row.eventKey),
    ]);
    const orphaned = snapshot.events.filter((row) => !retained.has(row.key));
    removals.push({
      scope: snapshot.scope,
      rangeKey: range.key,
      eventKeys: orphaned.map((row) => row.key),
    });
    bytes -= orphaned.reduce((sum, row) => sum + encoder.encode(JSON.stringify(row)).byteLength, 0);
    snapshot.events = snapshot.events.filter((row) => retained.has(row.key));
  }
  return { removals, bytes };
}

export function calendarMaterializationKey(
  userId: string,
  connection: Pick<import("./contracts").CalendarConnection, "workspaceId" | "bindingId">,
  start: string,
  end: string,
  hiddenKey: string,
  separateTarget: boolean,
  targetStart?: string,
  targetEnd?: string,
) {
  return JSON.stringify([
    userId,
    connection.workspaceId,
    connection.bindingId,
    start,
    end,
    hiddenKey,
    separateTarget ? targetStart : null,
    separateTarget ? targetEnd : null,
  ]);
}
export function isSeparateCalendarTarget(
  targetStart: string | undefined,
  targetEnd: string | undefined,
  start: string,
  end: string,
) {
  return Boolean(
    targetStart &&
    targetEnd &&
    (Date.parse(targetStart) < Date.parse(start) || Date.parse(targetEnd) > Date.parse(end)),
  );
}
export function calendarReadWindows(
  start: string,
  end: string,
  separateTarget: boolean,
  targetStart?: string,
  targetEnd?: string,
) {
  if (separateTarget && targetStart && targetEnd)
    return [
      { start, end },
      { start: targetStart, end: targetEnd },
    ];
  return [{ start, end }];
}
export function overlapCalendarWindow(
  range: { start: string; end: string },
  window: { start: string; end: string },
) {
  const a = Math.max(Date.parse(range.start), Date.parse(window.start)),
    b = Math.min(Date.parse(range.end), Date.parse(window.end));
  return a < b ? [{ start: new Date(a).toISOString(), end: new Date(b).toISOString() }] : [];
}

export function composeCalendarCacheSnapshot(
  calendars: CalendarRecord[],
  results: {
    calendarId: string;
    ranges: { events: CalendarEvent[]; stale: boolean }[];
    coverage: CalendarWindow[];
  }[],
  catalogLoaded: boolean,
  range: CalendarWindow,
  requestKey: string,
) {
  return {
    requestKey,
    calendars,
    events: [
      ...new Map(
        results
          .flatMap((r) => r.ranges.flatMap((r) => r.events))
          .map((e) => [calendarEventKey(e), e]),
      ).values(),
    ],
    coverage: results.map((r) => ({ calendarId: r.calendarId, ranges: r.coverage })),
    loaded: catalogLoaded && results.every((r) => coversCalendarRange(r.coverage, range)),
    catalogLoaded: catalogLoaded,
    stale: results.some((r) => r.ranges.some((r) => r.stale)),
  };
}
