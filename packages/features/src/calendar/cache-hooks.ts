import {
  calendarMaterializationKey,
  isSeparateCalendarTarget,
  calendarReadWindows,
  overlapCalendarWindow,
  composeCalendarCacheSnapshot,
} from "./cache";
import type { CalendarWindow } from "./coverage";
import type { CalendarConnection, CachedRange } from "./contracts";
import type { CalendarMetricName } from "./telemetry";
import { calendarKeys } from "./model";
import { reconcileCalendarMutations } from "./commands";
import { memoryCalendarStorage } from "./memory-storage";
import {
  useEffect,
  useState,
  useCallback,
  useSyncExternalStore,
  useRef,
  useMemo,
  type DependencyList,
} from "react";
import { useZilobaseFeatures } from "../shared/context";
import { defaultClientLifecycle } from "../shared/lifecycle";
import { readCalendarRangeCache } from "./store";
import { synchronizeCalendarCache } from "./sync";
import type { CalendarCacheStore as CalendarDatabase, CalendarCacheStorage } from "./storage";
import { calendarCollections, normalizeCalendarCatalog, type CalendarCollections } from "./store";
import { sharedClient } from "../data/client";
import { useSharedDataRevision } from "../data/react";
import { calendarEventKey } from "./model";
import { replaceEqualDeep, type QueryClient } from "@tanstack/react-query";
import type { ApiFetcher } from "../shared/api-fetcher";

export type CalendarCacheOptions = {
  apiOrigin: string;
  target?: CalendarWindow | null;
  hiddenKeys?: string[];
  missingOnly?: boolean;
  lifecycle?: import("../shared/lifecycle").ClientLifecycle;
  onMetric?: (name: CalendarMetricName, value: number) => void;
  bindRecovery?: (
    database: CalendarDatabase,
    refresh: (recover: boolean) => Promise<unknown>,
  ) => () => void;
};
export function useCalendarCache(
  connection: CalendarConnection,
  userId: string,
  start: string,
  end: string,
  options: CalendarCacheOptions,
) {
  const targetStart = options?.target?.start,
    targetEnd = options?.target?.end;
  const hiddenKey = JSON.stringify(options?.hiddenKeys ?? []);
  const requestKey = JSON.stringify([
    userId,
    connection.workspaceId,
    connection.bindingId,
    start,
    end,
    targetStart,
    targetEnd,
    hiddenKey,
  ]);
  const [readLatencyMs, setReadLatency] = useState(1000);
  const separateTarget = isSeparateCalendarTarget(targetStart, targetEnd, start, end);
  // Moving inside this window must not reread every buffered event.
  const materializationKey = calendarMaterializationKey(
    userId,
    connection,
    start,
    end,
    hiddenKey,
    separateTarget,
    targetStart,
    targetEnd,
  );
  const {
    queryClient: client,
    apiFetch,
    lifecycle: configuredLifecycle = defaultClientLifecycle,
    cacheStorage,
  } = useZilobaseFeatures();
  const lifecycle = options.lifecycle ?? configuredLifecycle;
  const owner = sharedClient(client);
  const runtimeKey = owner.capture().key;
  const [database, setDatabase] = useState<CalendarDatabase | null>(null),
    [error, setError] = useState<unknown>(),
    [syncing, setSyncing] = useState(false);
  const online = useSyncExternalStore(lifecycle.subscribe, lifecycle.isOnline, () => true);
  useEffect(
    () =>
      openBoundCalendarDatabase(
        connection,
        userId,
        options.apiOrigin,
        cacheStorage?.calendar,
        setDatabase,
        setError,
        memoryCalendarStorage(client),
      ),
    [
      connection.bindingId,
      connection.workspaceId,
      userId,
      options.apiOrigin,
      cacheStorage?.calendar,
      runtimeKey,
    ],
  );
  const activeRequest = useRef(0);
  const readController = useRef<AbortController | null>(null);
  useEffect(() => {
    activeRequest.current++;
    return () => {
      activeRequest.current++;
      readController.current?.abort();
    };
  }, [database, online]);
  const refresh = useCallback(
    async (recover = true, missingOnly = false) =>
      beginCalendarRefresh({
        database,
        apiFetch,
        onMetric: options.onMetric,
        online,
        activeRequest,
        readController,
        connection,
        client,
        hiddenKey,
        missingOnly,
        recover,
        targetStart,
        targetEnd,
        start,
        end,
        requestKey,
        setReadLatency,
        setError,
        setSyncing,
      }),
    [database, requestKey, online, apiFetch, options.onMetric],
  );
  const initialized = useRef<string | null>(null);
  useEffect(() => {
    void refresh(
      markCalendarInitialized(database, initialized),
      options.missingOnly ?? Boolean(options.hiddenKeys || options.target),
    );
  }, [refresh, database]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (database && online && options.bindRecovery)
      return options.bindRecovery(database, (recover) => refreshRef.current(recover));
  }, [database, online, options.bindRecovery]);
  useEffect(() => bindCalendarMutationReconcile(database, online, apiFetch), [database, online]);
  const cached = useCalendarSnapshot(
    client,
    database,
    () =>
      readCalendarSnapshot(
        database,
        userId,
        connection,
        requestKey,
        hiddenKey,
        start,
        end,
        separateTarget,
        targetStart,
        targetEnd,
        options.onMetric,
      ),
    [database, materializationKey],
    setError,
  );
  return calendarCacheState(cached, readLatencyMs, database, refresh, error, syncing, online);
}
async function refreshCalendarWindows(input: {
  database: CalendarDatabase;
  apiFetch: ApiFetcher;
  onMetric?: (name: CalendarMetricName, value: number) => void;
  connection: CalendarConnection;
  client: QueryClient;
  hiddenKey: string;
  missingOnly: boolean;
  recover: boolean;
  targetStart?: string;
  targetEnd?: string;
  start: string;
  end: string;
  requestKey: string;
  generation: number;
  current: () => boolean;
  controller: AbortController;
  setReadLatency: (value: number | ((old: number) => number)) => void;
  setError: (value: unknown) => void;
}) {
  const hiddenKeys: string[] = JSON.parse(input.hiddenKey);
  const recovered = Boolean(await input.database.readState("last_recovery"));
  const metadataLoaded = input.missingOnly && recovered;
  // A superseded viewport must not consume the binding's first recovery.
  const recoveryInput = { ...input, recover: input.recover || !recovered };
  const began = performance.now();
  await refreshTargetWindow(recoveryInput, hiddenKeys, metadataLoaded);
  if (!input.current()) return null;
  recordForegroundLatency(input, began);
  await synchronizeCalendarCache(
    input.database,
    input.start,
    input.end,
    input.apiFetch,
    input.targetStart ? false : recoveryInput.recover,
    {
      missingOnly: input.missingOnly,
      accountId: input.connection.accountId,
      signal: input.controller.signal,
      metadataLoaded: Boolean(input.targetStart) || metadataLoaded,
      hiddenKeys,
      onMetric: input.onMetric,
      requestId: `${input.requestKey}:${input.generation}`,
      isCurrent: input.current,
    },
  );
  if (input.database.isOpen())
    input.client.setQueryData(
      calendarKeys.calendars(input.connection),
      normalizeCalendarCatalog(
        input.client,
        sharedClient(input.client).capture(),
        input.connection.workspaceId,
        input.connection.bindingId,
        await input.database.readCalendars(),
      ),
    );
  if (input.current()) input.setError(undefined);
  return true;
}
async function refreshTargetWindow(
  input: Parameters<typeof refreshCalendarWindows>[0],
  hiddenKeys: string[],
  metadataLoaded: boolean,
) {
  if (!input.targetStart || !input.targetEnd) return;
  await synchronizeCalendarCache(
    input.database,
    input.targetStart,
    input.targetEnd,
    input.apiFetch,
    input.recover,
    {
      missingOnly: input.missingOnly,
      metadataLoaded,
      accountId: input.connection.accountId,
      hiddenKeys,
      onMetric: input.onMetric,
      priority: 10,
      signal: input.controller.signal,
      requestId: `${input.requestKey}:${input.generation}:target`,
      isCurrent: input.current,
    },
  );
}
async function beginCalendarRefresh(input: {
  database: CalendarDatabase | null;
  apiFetch: ApiFetcher;
  onMetric?: (name: CalendarMetricName, value: number) => void;
  online: boolean;
  activeRequest: { current: number };
  readController: { current: AbortController | null };
  connection: CalendarConnection;
  client: QueryClient;
  hiddenKey: string;
  missingOnly: boolean;
  recover: boolean;
  targetStart?: string;
  targetEnd?: string;
  start: string;
  end: string;
  requestKey: string;
  setReadLatency: (value: number | ((old: number) => number)) => void;
  setError: (value: unknown) => void;
  setSyncing: (value: boolean) => void;
}) {
  if (!input.database || !input.online) return null;
  const generation = ++input.activeRequest.current;
  const prior = input.readController.current;
  const controller = new AbortController();
  input.readController.current = controller;
  setTimeout(() => prior?.abort(), 100);
  input.setSyncing(true);
  return runCalendarRefresh({
    ...input,
    database: input.database,
    generation,
    current: () => generation === input.activeRequest.current,
    controller,
  });
}
async function runCalendarRefresh(
  input: Parameters<typeof refreshCalendarWindows>[0] & { setSyncing: (value: boolean) => void },
) {
  try {
    return await refreshCalendarWindows(input);
  } catch (cause) {
    if (input.current()) input.setError(cause);
    return null;
  } finally {
    if (input.current()) input.setSyncing(false);
  }
}
function markCalendarInitialized(
  database: CalendarDatabase | null,
  initialized: { current: string | null },
) {
  const recover = Boolean(database && initialized.current !== database.name);
  if (database) initialized.current = database.name;
  return recover;
}
function calendarCacheState(
  cached: Awaited<ReturnType<typeof readCalendarSnapshot>> | undefined,
  readLatencyMs: number,
  database: CalendarDatabase | null,
  refresh: (recover?: boolean, missingOnly?: boolean) => Promise<unknown>,
  error: unknown,
  syncing: boolean,
  online: boolean,
) {
  return {
    readLatencyMs,
    events: cached?.events,
    calendars: cached?.calendars,
    coverage: cached?.coverage,
    catalogLoaded: cached?.catalogLoaded,
    loaded: cached?.loaded,
    stale: cached?.stale,
    requestKey: cached?.requestKey,
    database,
    refresh,
    error,
    syncing,
    online,
  };
}
function openBoundCalendarDatabase(
  connection: CalendarConnection,
  userId: string,
  apiOrigin: string,
  storage: CalendarCacheStorage | undefined,
  setDatabase: (value: CalendarDatabase | null) => void,
  setError: (value: unknown) => void,
  fallback: CalendarCacheStorage,
) {
  let active = true;
  setDatabase(null);
  const identity = {
    apiOrigin,
    userId,
    workspaceId: connection.workspaceId,
    bindingId: connection.bindingId,
  };
  void (async () => {
    let db: CalendarDatabase;
    try {
      db = await (storage ?? fallback).open(identity);
    } catch {
      db = await fallback.open(identity);
    }
    if (active && db.isOpen()) {
      setError(undefined);
      setDatabase(db);
    }
  })().catch((error) => {
    if (active) setError(error);
  });
  return () => {
    active = false;
  };
}
function bindCalendarMutationReconcile(
  database: CalendarDatabase | null,
  online: boolean,
  apiFetch: ApiFetcher,
) {
  if (!database || !online) return;
  void reconcileCalendarMutations(database, apiFetch);
  const timer = setInterval(() => void reconcileCalendarMutations(database, apiFetch), 30_000);
  return () => clearInterval(timer);
}
async function readCalendarSnapshot(
  database: CalendarDatabase | null,
  userId: string,
  connection: CalendarConnection,
  requestKey: string,
  hiddenKey: string,
  start: string,
  end: string,
  separateTarget: boolean,
  targetStart?: string,
  targetEnd?: string,
  onMetric?: (name: CalendarMetricName, value: number) => void,
): Promise<CalendarSnapshot> {
  if (
    !database ||
    database.identity.userId !== userId ||
    database.identity.workspaceId !== connection.workspaceId ||
    database.identity.bindingId !== connection.bindingId
  )
    return {
      requestKey,
      calendars: [],
      events: [],
      coverage: [],
      catalogLoaded: false,
      loaded: false,
      stale: true,
    };
  return database.transaction("r", (database) =>
    materializeCalendarSnapshot(
      database,
      requestKey,
      hiddenKey,
      start,
      end,
      separateTarget,
      targetStart,
      targetEnd,
      onMetric,
    ),
  );
}

async function materializeCalendarSnapshot(
  database: CalendarDatabase,
  requestKey: string,
  hiddenKey: string,
  start: string,
  end: string,
  separateTarget: boolean,
  targetStart?: string,
  targetEnd?: string,
  onMetric?: (name: CalendarMetricName, value: number) => void,
) {
  const calendars = await database.readCalendars();
  const hidden = new Set<string>(JSON.parse(hiddenKey));
  const windows = calendarReadWindows(start, end, separateTarget, targetStart, targetEnd);
  const readable = calendars.filter(
    (c) =>
      c.permissions.read &&
      !c.permissions.freeBusyOnly &&
      !hidden.has(JSON.stringify([c.bindingId, c.id])),
  );
  const results = await Promise.all(
    readable.map((c) => readCalendarWindow(database, c.id, windows, onMetric)),
  );
  const known = Boolean(await database.readState("last_recovery"));
  return {
    ...composeCalendarCacheSnapshot(calendars, results, known, { start, end }, requestKey),
    rangeRows: results.flatMap((result) => result.rangeRows),
  };
}

async function readCalendarWindow(
  database: CalendarDatabase,
  calendarId: string,
  windows: { start: string; end: string }[],
  onMetric?: (name: CalendarMetricName, value: number) => void,
) {
  const ranges = await Promise.all(
    windows.map((w) => readCalendarRangeCache(database, calendarId, w.start, w.end, onMetric)),
  );
  const stored = await database.readRanges(calendarId);
  const coverage = stored.flatMap((r) => windows.flatMap((w) => overlapCalendarWindow(r, w)));
  return { ranges, calendarId, coverage, rangeRows: stored };
}
function recordForegroundLatency(
  input: Parameters<typeof refreshCalendarWindows>[0],
  began: number,
) {
  if (!input.targetStart) return;
  const elapsed = performance.now() - began;
  input.setReadLatency((old) => old * 0.75 + elapsed * 0.25);
  input.onMetric?.("foreground_latency", elapsed);
}

type CalendarSnapshot = ReturnType<typeof composeCalendarCacheSnapshot> & {
  rangeRows?: CachedRange[];
};
type CalendarSnapshotReference = Omit<CalendarSnapshot, "events" | "calendars" | "rangeRows"> & {
  eventIds: string[];
  calendarIds: string[];
  rangeIds: string[];
};
function useCalendarSnapshot(
  queryClient: QueryClient,
  database: CalendarDatabase | null,
  read: () => Promise<CalendarSnapshot>,
  dependencies: DependencyList,
  onError: (error: unknown) => void,
) {
  const owner = sharedClient(queryClient);
  const identity = owner.capture().key;
  const revision = useSharedDataRevision(queryClient);
  const [view, setView] = useState<{
    collections: CalendarCollections;
    reference: CalendarSnapshotReference;
    identity: string;
  }>();
  useEffect(() => {
    if (!database) {
      setView(undefined);
      return;
    }
    const capture = owner.capture();
    const collections = calendarCollections(
      queryClient,
      capture,
      database.identity.workspaceId,
      database.identity.bindingId,
    );
    const release = collections.session.retain();
    const stop = database.observe(
      async () => {
        const readCapture = owner.capture();
        await collections.session.ready();
        return { snapshot: await read(), readCapture };
      },
      ({ snapshot, readCapture }) => {
        if (!owner.isCurrent(readCapture) || readCapture.key !== capture.key) return;
        collections.publish(snapshot, readCapture.sequence);
        const { calendars, events, ...metadata } = snapshot;
        const rangeRows = metadata.rangeRows ?? [];
        const { rangeRows: _ranges, ...rest } = { ...metadata, rangeRows };
        setView({
          collections,
          identity: capture.key,
          reference: {
            ...rest,
            calendarIds: calendars.map((calendar) => calendar.id),
            eventIds: events.map(calendarEventKey),
            rangeIds: rangeRows.map((range) => range.key),
          },
        });
      },
      onError,
    );
    return () => {
      stop();
      release();
    };
  }, [queryClient, identity, ...dependencies]);
  const resolved = useRef<ReturnType<typeof composeCalendarCacheSnapshot> | undefined>(undefined);
  return useMemo(() => {
    if (!view || view.identity !== identity) return undefined;
    const { eventIds, calendarIds, rangeIds: _rangeIds, ...metadata } = view.reference;
    resolved.current = replaceEqualDeep(resolved.current, {
      ...metadata,
      events: eventIds.flatMap((id) => {
        const row = view.collections.events.get(id);
        return row ? [row.event] : [];
      }),
      calendars: calendarIds.flatMap((id) => {
        const row = view.collections.calendars.get(id);
        return row ? [row.calendar] : [];
      }),
    });
    return resolved.current;
  }, [view, identity, revision]);
}
