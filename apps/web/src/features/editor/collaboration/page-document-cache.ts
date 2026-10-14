import * as Y from "yjs";
import {
  pageCacheDatabase as db,
  pageCacheDeploymentKey,
  pageCacheDocuments,
  pruneDiskCache,
} from "@/platform/storage/page-cache-database";
import { blockSnapshotWrites, deletePageSnapshots } from "@/platform/storage/client-cache-storage";
export { pageCacheDeploymentKey } from "@/platform/storage/page-cache-database";

export type PageDocumentEntry = {
  document: Y.Doc;
  pageId: string;
  userId: string;
  key: string;
  hasPersistedState: boolean;
  locallyChanged: boolean;
  pendingWrites: number;
  references: number;
  lastUsedAt: number;
  persistenceError: Error | null;
  blocked: boolean;
  transportOrigin: unknown;
  errorListeners: Set<(error: Error) => void>;
  flush: () => Promise<void>;
  dispose: () => void;
};

const MEMORY_LIMIT = 5;
const COMPACT_UPDATE_LIMIT = 100;
const COMPACT_BYTE_LIMIT = 1024 * 1024;
const entries = pageCacheDocuments as Map<string, PageDocumentEntry>;
const opening = new Map<string, Promise<PageDocumentEntry>>();
const writeTails = new Map<string, Promise<void>>();

function cacheKey(userId: string, pageId: string) {
  const deployment = pageCacheDeploymentKey();
  return `${deployment}:${userId}:${pageId}`;
}

function queueWrite(entry: PageDocumentEntry, work: () => Promise<void>) {
  entry.pendingWrites += 1;
  const previous = writeTails.get(entry.key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(work)
    .catch((reason: unknown) => {
      entry.persistenceError =
        reason instanceof Error ? reason : new Error("Page cache write failed");
      for (const listener of entry.errorListeners) listener(entry.persistenceError);
    })
    .finally(() => {
      entry.pendingWrites -= 1;
    });
  writeTails.set(entry.key, next);
  return next;
}

async function createEntry(userId: string, pageId: string, key: string) {
  const [saved, updates] = await Promise.all([
    db.pages.get(key),
    db.updates.where("key").equals(key).sortBy("id"),
  ]);
  const document = new Y.Doc();
  for (const record of updates) Y.applyUpdate(document, record.update, "page-cache-hydration");
  const entry: PageDocumentEntry = {
    document,
    pageId,
    userId,
    key,
    hasPersistedState: saved?.initialized ?? updates.length > 0,
    locallyChanged: saved?.locallyChanged ?? false,
    pendingWrites: 0,
    references: 0,
    lastUsedAt: Date.now(),
    persistenceError: null,
    blocked: saved?.blocked ?? false,
    transportOrigin: null,
    errorListeners: new Set(),
    flush: () => writeTails.get(key) ?? Promise.resolve(),
    dispose: () => {
      document.destroy();
      entries.delete(key);
      writeTails.delete(key);
    },
  };
  let updateCount = updates.length;
  let updateBytes =
    saved?.bytes ?? updates.reduce((size, item) => size + item.update.byteLength, 0);
  document.on("update", (update: Uint8Array, origin: unknown) => {
    entry.hasPersistedState = true;
    const local =
      origin !== "page-cache-hydration" &&
      origin !== "page-bootstrap" &&
      (!entry.transportOrigin || origin !== entry.transportOrigin);
    if (local) entry.locallyChanged = true;
    void queueWrite(entry, async () => {
      await db.transaction("rw", db.pages, db.updates, async () => {
        updateCount += 1;
        updateBytes += update.byteLength;
        if (updateCount >= COMPACT_UPDATE_LIMIT || updateBytes >= COMPACT_BYTE_LIMIT) {
          const compacted = Y.encodeStateAsUpdate(document);
          await db.updates.where("key").equals(key).delete();
          await db.updates.add({ key, update: compacted });
          updateCount = 1;
          updateBytes = compacted.byteLength;
        } else {
          await db.updates.add({ key, update: new Uint8Array(update) });
        }
        const previous = await db.pages.get(key);
        await db.pages.put({
          key,
          userId,
          pageId,
          workspaceId: previous?.workspaceId ?? null,
          updatedAt: Date.now(),
          bytes: updateBytes,
          locallyChanged: entry.locallyChanged,
          initialized: true,
          blocked: entry.blocked,
        });
      });
    });
  });
  entries.set(key, entry);
  return entry;
}

export async function acquirePageDocument(userId: string, pageId: string) {
  const key = cacheKey(userId, pageId);
  let entry = entries.get(key);
  if (!entry) {
    let promise = opening.get(key);
    if (!promise) {
      promise = createEntry(userId, pageId, key);
      opening.set(key, promise);
      void promise.then(
        () => opening.delete(key),
        () => opening.delete(key),
      );
    }
    entry = await promise;
  }
  entry.references += 1;
  entry.lastUsedAt = Date.now();
  return entry;
}

export function releasePageDocument(entry: PageDocumentEntry) {
  entry.references = Math.max(0, entry.references - 1);
  entry.lastUsedAt = Date.now();
  void trimMemoryCache().catch(() => undefined);
  void pruneDiskCache().catch(() => undefined);
}

export function pageDocumentContainsUnsavedChanges(
  entry: PageDocumentEntry,
  serverState: Uint8Array,
) {
  const server = new Y.Doc();
  try {
    Y.applyUpdate(server, serverState);
    const before = Y.snapshot(server);
    Y.applyUpdate(server, Y.encodeStateAsUpdate(entry.document));
    return !Y.equalSnapshots(before, Y.snapshot(server));
  } finally {
    server.destroy();
  }
}

export async function verifyPageDocumentSaved(entry: PageDocumentEntry, serverState: Uint8Array) {
  if (entry.persistenceError) return false;
  if (!entry.locallyChanged) return true;
  const snapshot = Y.snapshot(entry.document);
  if (pageDocumentContainsUnsavedChanges(entry, serverState)) return false;
  await queueWrite(entry, async () => {
    if (!Y.equalSnapshots(snapshot, Y.snapshot(entry.document))) return;
    entry.locallyChanged = false;
    await db.pages.where("key").equals(entry.key).modify({ locallyChanged: false });
  });
  return !entry.locallyChanged;
}

export async function markPageDocumentInitialized(entry: PageDocumentEntry) {
  entry.hasPersistedState = true;
  await queueWrite(entry, async () => {
    const previous = await db.pages.get(entry.key);
    await db.pages.put({
      key: entry.key,
      userId: entry.userId,
      pageId: entry.pageId,
      workspaceId: previous?.workspaceId ?? null,
      updatedAt: Date.now(),
      bytes: previous?.bytes ?? 0,
      locallyChanged: entry.locallyChanged,
      initialized: true,
      blocked: entry.blocked,
    });
  });
}

export async function blockCachedPage(userId: string, pageId: string) {
  const key = cacheKey(userId, pageId);
  const entry = entries.get(key);
  if (entry) {
    entry.blocked = true;
  }
  await db.pages.where("key").equals(key).modify({ blocked: true });
  await deletePageSnapshots(userId, [`page:${pageId}`]);
}

export async function unblockCachedPage(entry: PageDocumentEntry) {
  entry.blocked = false;
  await db.pages.where("key").equals(entry.key).modify({ blocked: false });
}

export async function exportCachedPageState(userId: string, pageId: string) {
  const key = cacheKey(userId, pageId);
  const active = entries.get(key);
  if (active) {
    await active.flush();
    return Y.encodeStateAsUpdate(active.document);
  }
  const updates = await db.updates.where("key").equals(key).sortBy("id");
  if (!updates.length) return null;
  const document = new Y.Doc();
  try {
    for (const item of updates) Y.applyUpdate(document, item.update);
    return Y.encodeStateAsUpdate(document);
  } finally {
    document.destroy();
  }
}

export async function clearPageCacheForUser(userId: string) {
  await blockSnapshotWrites(userId);
  const deploymentPrefix = `${pageCacheDeploymentKey()}:`;
  const keys = (await db.pages.where("userId").equals(userId).primaryKeys()).filter((key) =>
    key.startsWith(deploymentPrefix),
  );
  const snapshotKeys = (await db.snapshots.where("userId").equals(userId).primaryKeys()).filter(
    (key) => key.startsWith(deploymentPrefix),
  );
  for (const key of keys) {
    const entry = entries.get(key);
    if (entry) {
      await entry.flush();
      entry.document.destroy();
      entries.delete(key);
      writeTails.delete(key);
    }
  }
  await db.transaction("rw", db.pages, db.updates, db.snapshots, async () => {
    await db.updates.where("key").anyOf(keys).delete();
    await db.pages.bulkDelete(keys);
    await db.snapshots.bulkDelete(snapshotKeys);
  });
}

async function trimMemoryCache() {
  if (entries.size <= MEMORY_LIMIT) return;
  const candidates = [...entries.values()]
    .filter((entry) => entry.references === 0)
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  while (entries.size > MEMORY_LIMIT && candidates.length) {
    const entry = candidates.shift()!;
    await dropIdleEntry(entry);
  }
}

export async function dropIdlePageDocument(userId: string, pageId: string) {
  const entry = entries.get(cacheKey(userId, pageId));
  return entry ? dropIdleEntry(entry) : false;
}

async function dropIdleEntry(entry: PageDocumentEntry) {
  if (entry.references) return false;
  await entry.flush();
  if (entry.references || entry.pendingWrites || entries.get(entry.key) !== entry) return false;
  entry.document.destroy();
  entries.delete(entry.key);
  writeTails.delete(entry.key);
  return true;
}

export async function flushCachedPage(userId: string, pageId: string) {
  const key = cacheKey(userId, pageId);
  const entry = entries.get(key) ?? (await opening.get(key));
  if (!entry) return;
  await entry.flush();
  if (entry.persistenceError) throw entry.persistenceError;
}
