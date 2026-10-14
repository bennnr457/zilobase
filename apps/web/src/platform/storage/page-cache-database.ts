import Dexie, { type EntityTable } from "dexie";
import type { SessionResponse } from "@zilobase/features/auth";
import {
  getSelectedDesktopServer,
  resolveRuntimeApiOrigin,
} from "@/platform/server/desktop-server";

export type CachedPage = {
  key: string;
  userId: string;
  pageId: string;
  workspaceId: string | null;
  updatedAt: number;
  bytes: number;
  locallyChanged: boolean;
  initialized: boolean;
  blocked: boolean;
};

export type CachedUpdate = { id?: number; key: string; update: Uint8Array };
type CachedSession = { key: string; value: SessionResponse };
export type CachedPageSnapshot = {
  key: string;
  scopeKey: string;
  userId: string;
  queryKey: unknown[];
  data: unknown;
  updatedAt: number;
  bytes: number;
};

class PageCacheDatabase extends Dexie {
  pages!: EntityTable<CachedPage, "key">;
  updates!: EntityTable<CachedUpdate, "id">;
  sessions!: EntityTable<CachedSession, "key">;
  snapshots!: EntityTable<CachedPageSnapshot, "key">;

  constructor() {
    super("zilobase-page-cache-v1");
    this.version(1).stores({ pages: "key,userId,updatedAt", updates: "++id,key" });
    this.version(2).stores({
      pages: "key,userId,updatedAt",
      updates: "++id,key",
      sessions: "key",
    });
    this.version(3).stores({
      pages: "key,userId,updatedAt",
      updates: "++id,key",
      sessions: "key",
      snapshots: "key,scopeKey,userId,updatedAt",
    });
    this.version(4)
      .stores({
        pages: "key,userId,updatedAt",
        updates: "++id,key",
        sessions: "key",
        snapshots: "key,scopeKey,userId,updatedAt",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("pages")
          .toCollection()
          .modify((page) => {
            Reflect.deleteProperty(page, "detail");
          });
        await transaction
          .table("snapshots")
          .filter((snapshot) => {
            const key = snapshot.queryKey;
            return (
              Array.isArray(key) &&
              (["pages", "db", "database", "database-context-export", "search"].includes(key[0]) ||
                (key[0] === "page" &&
                  (key.length === 2 || ["properties", "access"].includes(key[2]))))
            );
          })
          .delete();
      });
  }
}

const db = new PageCacheDatabase();
export { db as pageCacheDatabase };
export const pageCacheDocuments = new Map<
  string,
  {
    readonly locallyChanged: boolean;
    readonly references: number;
    flush(): Promise<void>;
    dispose(): void;
  }
>();
const DISK_PAGE_LIMIT = 100;
const DISK_BYTE_LIMIT = 100 * 1024 * 1024;
const SNAPSHOT_LIMIT = 300;

export function pageCacheDeploymentKey() {
  return typeof window === "undefined"
    ? "server"
    : `${window.location.origin}|${getSelectedDesktopServer()?.instanceId ?? resolveRuntimeApiOrigin()}`;
}

export async function pruneDiskCache() {
  const pages = await db.pages.orderBy("updatedAt").toArray();
  const snapshots = await db.snapshots.orderBy("updatedAt").toArray();
  let bytes =
    pages.reduce((total, page) => total + page.bytes, 0) +
    snapshots.reduce((total, snapshot) => total + snapshot.bytes, 0);
  let pageCount = pages.length;
  let snapshotCount = snapshots.length;
  if (pageCount <= DISK_PAGE_LIMIT && snapshotCount <= SNAPSHOT_LIMIT && bytes <= DISK_BYTE_LIMIT)
    return;
  const candidates = [
    ...pages.map((page) => ({ kind: "page" as const, value: page })),
    ...snapshots.map((snapshot) => ({ kind: "snapshot" as const, value: snapshot })),
  ].sort((a, b) => a.value.updatedAt - b.value.updatedAt);
  for (const candidate of candidates) {
    if (pageCount <= DISK_PAGE_LIMIT && snapshotCount <= SNAPSHOT_LIMIT && bytes <= DISK_BYTE_LIMIT)
      break;
    if (candidate.kind === "snapshot") {
      if (snapshotCount <= SNAPSHOT_LIMIT && bytes <= DISK_BYTE_LIMIT) continue;
      await db.snapshots.delete(candidate.value.key);
      snapshotCount -= 1;
      bytes -= candidate.value.bytes;
      continue;
    }
    if (pageCount <= DISK_PAGE_LIMIT && bytes <= DISK_BYTE_LIMIT) continue;
    const page = candidate.value;
    const entry = pageCacheDocuments.get(page.key);
    if (page.locallyChanged || entry?.locallyChanged || entry?.references) continue;
    if (entry) {
      await entry.flush();
      if (entry.references || entry.locallyChanged) continue;
      entry.dispose();
      pageCacheDocuments.delete(page.key);
    }
    await db.transaction("rw", db.pages, db.updates, async () => {
      await db.updates.where("key").equals(page.key).delete();
      await db.pages.delete(page.key);
    });
    pageCount -= 1;
    bytes -= page.bytes;
  }
}
