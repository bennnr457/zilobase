import type {
  CalendarCacheIdentity,
  CalendarEvent,
  CalendarRecord,
  CachedRange,
  PendingCalendarMutation,
} from "./contracts";

export type CalendarStoredEvent = { key: string; event: CalendarEvent };
export type CalendarStoredState = { key: string; generation: number; revision: number };
export type CalendarCacheWrite = {
  calendars?: CalendarRecord[];
  events?: CalendarStoredEvent[];
  deleteEvents?: string[];
  ranges?: CachedRange[];
  deleteRanges?: string[];
  rangeUpdates?: { key: string; patch: Partial<CachedRange> }[];
  addPending?: PendingCalendarMutation[];
  pending?: PendingCalendarMutation[];
  pendingUpdates?: { id: string; patch: Partial<PendingCalendarMutation> }[];
  deletePending?: string[];
  state?: CalendarStoredState[];
  deleteState?: string[];
};

/** Storage operations only. Reconciliation and publication belong to the shared client. */
export type CalendarCacheStore = {
  readonly name: string;
  readonly identity: CalendarCacheIdentity;
  isOpen(): boolean;
  readCalendars(): Promise<CalendarRecord[]>;
  readEvents(keys?: readonly string[]): Promise<(CalendarStoredEvent | undefined)[]>;
  readRanges(calendarId?: string): Promise<CachedRange[]>;
  readRange(key: string): Promise<CachedRange | undefined>;
  readPending(eventKey?: string): Promise<PendingCalendarMutation[]>;
  readState(key: string): Promise<CalendarStoredState | undefined>;
  write(changes: CalendarCacheWrite): Promise<void>;
  transaction<T>(mode: "r" | "rw", work: (cache: CalendarCacheStore) => Promise<T>): Promise<T>;
  observe<T>(
    read: (cache: CalendarCacheStore) => Promise<T>,
    next: (value: T) => void,
    error: (reason: unknown) => void,
  ): () => void;
  related(): CalendarCacheStore[];
  withLock?<T>(key: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T>;
};

export type CalendarCacheStorage = {
  open(identity: CalendarCacheIdentity): Promise<CalendarCacheStore>;
  clear(identity: CalendarCacheIdentity): Promise<void>;
};

export function calendarRangeKey(calendarId: string, start: string, end: string) {
  return JSON.stringify([calendarId, start, end]);
}
