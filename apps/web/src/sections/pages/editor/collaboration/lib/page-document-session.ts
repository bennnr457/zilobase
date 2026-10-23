import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { Awareness } from "y-protocols/awareness";
import type { PageDocumentEntry } from "./page-document-cache";
import type {
  CollaborationStatus,
  CollaborationUser,
  CollaborationTicket,
} from "./collaboration-connection";

export type DocumentSessionSnapshot = {
  document: PageDocumentEntry["document"] | null;
  entry: PageDocumentEntry | null;
  awareness: Awareness | null;
  provider: HocuspocusProvider | null;
  error: string | null;
  status: CollaborationStatus;
  synced: boolean;
  online: boolean;
  canEdit: boolean;
  unsyncedChanges: number;
  user?: { avatar?: string | null; color: string; id: string; name: string };
  users: CollaborationUser[];
};
export const emptyDocumentSession: DocumentSessionSnapshot = {
  document: null,
  entry: null,
  awareness: null,
  provider: null,
  error: null,
  status: "disconnected",
  synced: false,
  online: true,
  canEdit: false,
  unsyncedChanges: 0,
  users: [],
};
type SessionUser = NonNullable<DocumentSessionSnapshot["user"]>;
export type PageSessionServices = {
  isAccessDenied: (reason: unknown) => boolean;
  acquire: (userId: string, pageId: string) => Promise<PageDocumentEntry>;
  release: (entry: PageDocumentEntry) => void;
  initialize: (entry: PageDocumentEntry) => Promise<void>;
  unblock: (entry: PageDocumentEntry) => Promise<void>;
  verify: (entry: PageDocumentEntry, state: string) => Promise<void>;
  awareness: (entry: PageDocumentEntry) => Awareness;
  getTicket: (
    pageId: string,
    signal?: AbortSignal,
    includeState?: boolean,
  ) => Promise<CollaborationTicket>;
  applyTicket: (entry: PageDocumentEntry, ticket: CollaborationTicket) => void;
  online: () => boolean;
  subscribeConnectivity: (listener: () => void) => () => void;
  subscribeResume: (listener: () => void) => () => void;
  schedule: (callback: () => void) => () => void;
  connect: (input: {
    entry: PageDocumentEntry;
    awareness: Awareness;
    pageId: string;
    preparedTicket: CollaborationTicket | null;
    user: SessionUser;
    publish: (patch: Partial<DocumentSessionSnapshot>) => void;
  }) => () => void;
};

/** One document, awareness and transport per deployment/account/page lease group. */
export function createPageDocumentSession(
  input: { user: SessionUser; pageId: string },
  services: PageSessionServices,
) {
  let snapshot = { ...emptyDocumentSession, online: services.online(), user: input.user };
  const listeners = new Set<() => void>();
  const controller = new AbortController();
  let disposed = false;
  let startupAllowed = false;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let verifyTimer: ReturnType<typeof setTimeout> | undefined;
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  let stopConnection: (() => void) | undefined;
  let cancelConnect: (() => void) | undefined;
  let epoch = 0;
  let acquiring = false;

  const publish = (patch: Partial<DocumentSessionSnapshot>) => {
    if (disposed) return;
    const next = { ...snapshot, ...patch };
    if (patch.status && patch.status !== "connected") next.synced = false;
    if (patch.status === "blocked" || patch.status === "disconnected" || patch.error)
      startupAllowed = false;
    next.canEdit = canEditPageDuringConnection({
      online: next.online,
      error: next.error,
      cacheError: next.entry?.persistenceError ?? null,
      blocked: next.entry?.blocked ?? false,
      startupAllowed,
      status: next.status,
      synced: next.synced,
    });
    snapshot = next;
    if (
      !next.online ||
      next.status === "blocked" ||
      (next.status === "connected" && next.synced && !next.error)
    ) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
      clearTimeout(syncTimer);
      syncTimer = undefined;
    }
    for (const listener of listeners) listener();
    if (patch.provider) connectProvider(patch.provider);
    if (next.synced && next.entry && next.unsyncedChanges === 0 && next.entry.locallyChanged)
      scheduleVerification();
  };
  const fail = (reason: unknown) =>
    publish({ error: reason instanceof Error ? reason.message : "Could not open page content." });
  const cacheError = (reason: Error) =>
    publish({ error: `Local page cache failed: ${reason.message}` });
  const connectProvider = (provider: HocuspocusProvider) => {
    cancelConnect?.();
    if (!snapshot.online) return;
    cancelConnect = services.schedule(() => {
      if (!disposed && snapshot.provider === provider && snapshot.online) {
        void provider.connect().catch(() => {
          if (disposed || snapshot.provider !== provider) return;
          publish({ status: "disconnected", synced: false });
          scheduleRetry();
        });
      }
    });
  };
  const scheduleVerification = () => {
    if (verifyTimer !== undefined) return;
    verifyTimer = setTimeout(() => {
      verifyTimer = undefined;
      void verifySaved();
    }, 2_000);
  };
  const verifySaved = async () => {
    const entry = snapshot.entry;
    if (
      disposed ||
      !entry ||
      !snapshot.online ||
      !snapshot.synced ||
      snapshot.unsyncedChanges !== 0
    )
      return;
    try {
      const ticket = await services.getTicket(input.pageId, controller.signal, true);
      if (!disposed && ticket.initialState) await services.verify(entry, ticket.initialState);
    } catch {
      /* Unconfirmed local updates stay durable in the existing cache. */
    }
    if (!disposed && entry.locallyChanged) {
      verifyTimer = setTimeout(() => {
        verifyTimer = undefined;
        void verifySaved();
      }, 30_000);
    }
  };
  const waitForSync = () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = undefined;
      if (disposed || !snapshot.online || snapshot.status === "blocked") return;
      startupAllowed = false;
      startConnection(null);
    }, 30_000);
  };
  const startConnection = (preparedTicket: CollaborationTicket | null) => {
    if (disposed || !snapshot.entry || !snapshot.online || snapshot.status === "blocked") return;
    const generation = ++epoch;
    clearTimeout(retryTimer);
    retryTimer = undefined;
    cancelConnect?.();
    stopConnection?.();
    // Hocuspocus destroys its awareness during teardown. A replacement transport
    // needs fresh presence timers/listeners, while retaining the same cached Y.Doc.
    const previousAwareness = snapshot.awareness;
    const awareness = services.awareness(snapshot.entry);
    const clientId = snapshot.entry.document.clientID;
    const previousClock = previousAwareness?.meta.get(clientId)?.clock ?? 0;
    // Peers ignore presence whose clock moved backwards after a transport swap.
    if (previousClock > 0)
      awareness.meta.set(clientId, { clock: previousClock + 1, lastUpdated: Date.now() });
    snapshot.entry.transportOrigin = null;
    publish({
      awareness,
      provider: null,
      synced: false,
      users: [],
      status: "connecting",
      error: null,
    });
    waitForSync();
    stopConnection = services.connect({
      entry: snapshot.entry,
      awareness,
      pageId: input.pageId,
      preparedTicket,
      user: snapshot.user!,
      publish: (patch) => {
        if (disposed || generation !== epoch) return;
        if (patch.provider !== undefined) snapshot.entry!.transportOrigin = patch.provider;
        publish(patch);
        if (patch.synced) void services.unblock(snapshot.entry!);
        if (patch.status === "disconnected" && snapshot.online) scheduleRetry();
      },
    });
  };
  const scheduleRetry = () => {
    if (disposed || retryTimer !== undefined || !snapshot.online || snapshot.status === "blocked")
      return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (snapshot.entry) startConnection(null);
      else void acquire();
    }, 3_000);
  };
  const acquire = async () => {
    if (disposed || acquiring) return;
    acquiring = true;
    let entry: PageDocumentEntry | null = null;
    try {
      entry = await services.acquire(input.user.id, input.pageId);
      if (disposed) {
        services.release(entry);
        return;
      }
      let preparedTicket: CollaborationTicket | null = null;
      if (!entry.hasPersistedState) {
        if (!services.online()) throw new Error("Page content is unavailable offline.");
        preparedTicket = await services.getTicket(input.pageId, controller.signal, true);
        if (disposed) {
          services.release(entry);
          return;
        }
        services.applyTicket(entry, preparedTicket);
        await entry.flush();
        if (entry.persistenceError) throw entry.persistenceError;
        await services.initialize(entry);
      }
      if (disposed) {
        services.release(entry);
        return;
      }
      entry.errorListeners.add(cacheError);
      startupAllowed = services.online() && !entry.persistenceError && !entry.blocked;
      publish({
        entry,
        document: entry.document,
        error: null,
        online: services.online(),
      });
      startupTimer = setTimeout(() => {
        startupAllowed = false;
        publish({});
      }, 20_000);
      startConnection(preparedTicket);
    } catch (reason) {
      if (entry && snapshot.entry !== entry) services.release(entry);
      if (!disposed) {
        if (services.isAccessDenied(reason)) publish({ status: "blocked", synced: false });
        fail(reason);
        scheduleRetry();
      }
    } finally {
      acquiring = false;
    }
  };
  const unsubscribeConnectivity = services.subscribeConnectivity(() => {
    const online = services.online();
    if (!online) {
      startupAllowed = false;
      cancelConnect?.();
      snapshot.provider?.disconnect();
      publish({
        online,
        synced: false,
        status: snapshot.status === "blocked" ? "blocked" : "disconnected",
      });
    } else {
      publish({ online });
      if (snapshot.status === "blocked") return;
      if (snapshot.provider) {
        waitForSync();
        connectProvider(snapshot.provider);
      } else if (snapshot.entry) startConnection(null);
      else scheduleRetry();
    }
  });
  const unsubscribeResume = services.subscribeResume(() => {
    if (disposed || !snapshot.online || !services.online() || snapshot.status === "blocked") return;
    if (!snapshot.entry) {
      scheduleRetry();
      return;
    }
    if (snapshot.status === "disconnected" || snapshot.error) {
      startConnection(null);
      return;
    }
    // Duplicate focus/visibility events must not restart an in-flight handshake.
    if (syncTimer !== undefined) return;
    const provider = snapshot.provider;
    if (!provider) {
      startConnection(null);
      return;
    }
    // An OPEN socket can be stale after sleep. Require a fresh sync reply before
    // enabling edits; the deadline replaces it if the peer never responds.
    startupAllowed = false;
    waitForSync();
    publish({ synced: false });
    provider.synced = false;
    provider.forceSync();
  });
  void acquire();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    updateUser(user: SessionUser) {
      if (disposed) return;
      snapshot.provider?.setAwarenessField("user", user);
      publish({ user });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ++epoch;
      controller.abort();
      clearTimeout(startupTimer);
      clearTimeout(retryTimer);
      clearTimeout(verifyTimer);
      clearTimeout(syncTimer);
      cancelConnect?.();
      stopConnection?.();
      unsubscribeConnectivity();
      unsubscribeResume();
      snapshot.entry?.errorListeners.delete(cacheError);
      if (snapshot.entry) {
        snapshot.entry.transportOrigin = null;
        services.release(snapshot.entry);
      }
      listeners.clear();
    },
  };
}
export type PageDocumentSession = ReturnType<typeof createPageDocumentSession>;

/** Leases belong to registrations, so late cleanup cannot release another consumer. */
export function createDocumentSessionRegistry<T extends { dispose: () => void }>() {
  const sessions = new Map<string, { session: T; leases: Set<symbol> }>();
  return {
    acquire(key: string, create: () => T) {
      let entry = sessions.get(key);
      if (!entry) {
        entry = { session: create(), leases: new Set() };
        sessions.set(key, entry);
      }
      const token = Symbol(key);
      entry.leases.add(token);
      let released = false;
      return {
        session: entry.session,
        release() {
          if (released) return;
          released = true;
          entry.leases.delete(token);
          if (entry.leases.size === 0 && sessions.get(key) === entry) {
            sessions.delete(key);
            entry.session.dispose();
          }
        },
      };
    },
    dispose() {
      for (const entry of sessions.values()) entry.session.dispose();
      sessions.clear();
    },
    get size() {
      return sessions.size;
    },
  };
}

export function hasPendingCollaborationChanges(
  collaboration: { unsyncedChanges: number } | null | undefined,
) {
  return Boolean(collaboration && collaboration.unsyncedChanges > 0);
}

export function canEditPageDuringConnection(input: {
  online: boolean;
  error: string | null;
  cacheError: Error | null;
  blocked: boolean;
  startupAllowed: boolean;
  status: CollaborationStatus;
  synced: boolean;
}) {
  return (
    input.online &&
    !input.error &&
    !input.cacheError &&
    !input.blocked &&
    input.status !== "blocked" &&
    (input.startupAllowed || (input.status === "connected" && input.synced))
  );
}

export type PageConnectionIndicator = "connecting" | "connected";

const indicators = new Map<string, PageConnectionIndicator>();
const listeners = new Map<string, Set<() => void>>();

export function getPageConnectionIndicator(pageId: string) {
  return indicators.get(pageId) ?? null;
}

export function subscribePageConnectionIndicator(pageId: string, listener: () => void) {
  const pageListeners = listeners.get(pageId) ?? new Set<() => void>();
  pageListeners.add(listener);
  listeners.set(pageId, pageListeners);

  return () => {
    pageListeners.delete(listener);
    if (pageListeners.size === 0) listeners.delete(pageId);
  };
}

export function setPageConnectionIndicator(
  pageId: string,
  indicator: PageConnectionIndicator | null,
) {
  if (getPageConnectionIndicator(pageId) === indicator) return;
  if (indicator) indicators.set(pageId, indicator);
  else indicators.delete(pageId);
  listeners.get(pageId)?.forEach((listener) => listener());
}
