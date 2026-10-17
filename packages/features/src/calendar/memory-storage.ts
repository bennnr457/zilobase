import type { QueryClient } from "@tanstack/react-query";
import { sharedClient } from "../data/client";
import type { CalendarCacheSnapshot } from "../shared/cache-storage";
import type { CalendarCacheIdentity } from "./contracts";
import type { CalendarCacheStorage, CalendarCacheStore, CalendarCacheWrite } from "./storage";

/** Physical backing for the existing storage port when durable storage is unavailable. */
export function createMemoryCalendarStorage(current = () => true) {
  const stores = new Map<string, CalendarCacheStore>();
  const closers = new Map<string, () => void>();
  const open = async (identity: CalendarCacheIdentity) => {
    const name = `calendar:memory:${JSON.stringify(identity)}`;
    const existing = stores.get(name);
    if (existing) return existing;
    let active = true;
    let state: CalendarCacheSnapshot = {
      calendars: [],
      events: [],
      ranges: [],
      pending: [],
      state: [],
    };
    let queue = Promise.resolve();
    const listeners = new Set<() => void>();
    const check = () => {
      if (!active || !current()) throw new Error("Calendar storage scope expired");
    };
    const copy = <T>(value: T): T => structuredClone(value);
    const patch = (target: CalendarCacheSnapshot, changes: CalendarCacheWrite) => {
      const replace = <T>(rows: T[], values: T[] | undefined, key: (row: T) => string) => {
        for (const value of values ?? []) {
          const index = rows.findIndex((row) => key(row) === key(value));
          if (index < 0) rows.push(copy(value));
          else rows[index] = copy(value);
        }
      };
      if (changes.calendars) target.calendars = copy(changes.calendars);
      target.events = target.events.filter((r) => !changes.deleteEvents?.includes(r.key));
      target.ranges = target.ranges.filter((r) => !changes.deleteRanges?.includes(r.key));
      target.pending = target.pending.filter((r) => !changes.deletePending?.includes(r.id));
      target.state = target.state.filter((r) => !changes.deleteState?.includes(r.key));
      for (const pending of changes.addPending ?? [])
        if (target.pending.some((row) => row.id === pending.id))
          throw new Error("Duplicate calendar operation");
      replace(target.events, changes.events, (r) => r.key);
      replace(target.ranges, changes.ranges, (r) => r.key);
      replace(target.pending, changes.addPending, (r) => r.id);
      replace(target.pending, changes.pending, (r) => r.id);
      replace(target.state, changes.state, (r) => r.key);
      for (const { key, patch: value } of changes.rangeUpdates ?? []) {
        const row = target.ranges.find((r) => r.key === key);
        if (row) Object.assign(row, copy(value));
      }
      for (const { id, patch: value } of changes.pendingUpdates ?? []) {
        const row = target.pending.find((r) => r.id === id);
        if (row) Object.assign(row, copy(value));
      }
    };
    const view = (read: () => CalendarCacheSnapshot): CalendarCacheStore => ({
      name,
      identity,
      persistent: false,
      isOpen: () => active && current(),
      readCalendars: async () => {
        check();
        return copy(read().calendars);
      },
      readEvents: async (keys) => {
        check();
        return copy(
          keys ? keys.map((key) => read().events.find((r) => r.key === key)) : read().events,
        );
      },
      readRanges: async (id) => {
        check();
        return copy(read().ranges.filter((r) => id === undefined || r.calendarId === id));
      },
      readRange: async (key) => {
        check();
        return copy(read().ranges.find((r) => r.key === key));
      },
      readPending: async (key) => {
        check();
        return copy(read().pending.filter((r) => key === undefined || r.eventKey === key));
      },
      readState: async (key) => {
        check();
        return copy(read().state.find((r) => r.key === key));
      },
      write: async (changes) => {
        check();
        patch(read(), changes);
      },
      transaction: async (_mode, work) => work(view(read)),
      observe: (readValue, next, error) => {
        let subscribed = true;
        let generation = 0;
        const publish = () => {
          const token = ++generation;
          void readValue(store).then(
            (value) => {
              if (subscribed && store.isOpen() && token === generation) next(value);
            },
            (cause) => {
              if (subscribed && token === generation) error(cause);
            },
          );
        };
        listeners.add(publish);
        publish();
        return () => {
          subscribed = false;
          listeners.delete(publish);
        };
      },
      related: () => [...stores.values()].filter((store) => store.isOpen()),
    });
    const store = view(() => state);
    store.transaction = (mode, work) => {
      const run = async () => {
        check();
        const draft = copy(state);
        const result = await work(view(() => draft));
        check();
        if (mode === "rw") {
          state = draft;
          for (const listener of listeners) listener();
        }
        return result;
      };
      const result = queue.then(run);
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    };
    store.write = (changes) => store.transaction("rw", (tx) => tx.write(changes));
    stores.set(name, store);
    closers.set(name, () => {
      active = false;
      listeners.clear();
    });
    return store;
  };
  return {
    open,
    async clear(identity: CalendarCacheIdentity) {
      const name = `calendar:memory:${JSON.stringify(identity)}`;
      closers.get(name)?.();
      closers.delete(name);
      stores.delete(name);
    },
    dispose() {
      for (const close of closers.values()) close();
      closers.clear();
      stores.clear();
    },
  } satisfies CalendarCacheStorage & { dispose(): void };
}

const runtimes = new WeakMap<
  QueryClient,
  { key: string; storage: ReturnType<typeof createMemoryCalendarStorage> }
>();
export function memoryCalendarStorage(client: QueryClient) {
  const owner = sharedClient(client),
    scope = owner.capture();
  let runtime = runtimes.get(client);
  if (!runtime || runtime.key !== scope.key) {
    runtime?.storage.dispose();
    runtime = {
      key: scope.key,
      storage: createMemoryCalendarStorage(() => owner.isCurrent(scope)),
    };
    runtimes.set(client, runtime);
  }
  return runtime.storage;
}
export function disposeMemoryCalendarStorage(client: QueryClient) {
  runtimes.get(client)?.storage.dispose();
  runtimes.delete(client);
}
