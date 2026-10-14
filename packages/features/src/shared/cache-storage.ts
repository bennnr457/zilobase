import type { SessionResponse } from "../auth/contracts";
import type { PageReadSnapshot } from "../pages/read-cache";
import type {
  CalendarRecord,
  CalendarEvent,
  CachedRange,
  PendingCalendarMutation,
} from "../calendar/contracts";
import type { CalendarCacheStorage } from "../calendar/storage";

export type ClientCacheScope = { deployment: string; userId: string };
export type ClientReadSnapshot = PageReadSnapshot & { scope: string; bytes: number };
export type CalendarCacheSnapshot = {
  calendars: CalendarRecord[];
  events: { key: string; event: CalendarEvent }[];
  ranges: CachedRange[];
  pending: PendingCalendarMutation[];
  state: { key: string; generation: number; revision: number }[];
};

/** Platform implementations preserve atomic writes and account-scoped deletion. */
export type ClientCacheStorage = {
  session: {
    load(deployment: string): Promise<SessionResponse | null>;
    write(deployment: string, value: SessionResponse): Promise<void>;
    clear(deployment: string): Promise<void>;
  };
  snapshots: {
    load(scope: ClientCacheScope, scopes: readonly string[]): Promise<ClientReadSnapshot[]>;
    write(scope: ClientCacheScope, snapshot: ClientReadSnapshot): Promise<void>;
    delete(scope: ClientCacheScope, scopes: readonly string[]): Promise<void>;
    clear(scope: ClientCacheScope): Promise<void>;
  };
  calendar?: CalendarCacheStorage;
};

export function clientReadSnapshot(
  snapshot: PageReadSnapshot & { scope: string },
): ClientReadSnapshot | null {
  const serialized = JSON.stringify(snapshot.data);
  if (!serialized) return null;
  const bytes = new TextEncoder().encode(serialized).byteLength;
  return bytes <= 2 * 1024 * 1024 ? { ...snapshot, bytes } : null;
}

export async function rememberClientSession(
  storage: ClientCacheStorage,
  deployment: string,
  value: SessionResponse,
) {
  if (!value.user) await storage.session.clear(deployment);
  else if (value.session) await storage.session.write(deployment, value);
}

export function canReplaceClientSnapshot(
  previous: { updatedAt: number } | undefined,
  incoming: { updatedAt: number },
) {
  return !previous || previous.updatedAt <= incoming.updatedAt;
}
