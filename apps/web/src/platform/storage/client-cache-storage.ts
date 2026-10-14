import type { ClientCacheStorage } from "@zilobase/features";
import { canReplaceClientSnapshot, clientReadSnapshot } from "@zilobase/features";
import type { SessionResponse } from "@zilobase/features/auth";
import {
  pageCacheDatabase as db,
  pageCacheDeploymentKey,
  pruneDiskCache,
} from "./page-cache-database";
import {
  openCalendarDatabase,
  destroyCalendarDatabase,
  calendarDatabaseName,
  calendarCacheStore,
} from "@/features/calendar/storage/calendar-database";

const snapshotWriteTails = new Map<string, Promise<void>>();
const blockedSnapshotUsers = new Set<string>();

export async function rememberCachedSession(
  value: SessionResponse,
  deployment = pageCacheDeploymentKey(),
) {
  if (!value.user || !value.session) return;
  blockedSnapshotUsers.delete(`${deployment}:${value.user.id}`);
  await db.sessions.put({ key: deployment, value });
}

export async function readCachedSession(deployment = pageCacheDeploymentKey()) {
  return (await db.sessions.get(deployment))?.value ?? null;
}

export async function clearCachedSession(deployment = pageCacheDeploymentKey()) {
  await db.sessions.delete(deployment);
}

function snapshotScopeKey(userId: string, scope: string, deployment: string) {
  return `${deployment}:${userId}:${scope}`;
}

function queueSnapshotWrite(userId: string, work: () => Promise<void>, deployment: string) {
  const ownerKey = `${deployment}:${userId}`;
  if (blockedSnapshotUsers.has(ownerKey)) return Promise.resolve();
  const previous = snapshotWriteTails.get(ownerKey) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => (blockedSnapshotUsers.has(ownerKey) ? undefined : work()));
  snapshotWriteTails.set(ownerKey, next);
  void next
    .finally(() => {
      if (snapshotWriteTails.get(ownerKey) === next) snapshotWriteTails.delete(ownerKey);
    })
    .catch(() => undefined);
  return next;
}

export async function rememberPageSnapshot(
  userId: string,
  scope: string,
  queryKey: unknown[],
  data: unknown,
  updatedAt: number,
  deployment = pageCacheDeploymentKey(),
) {
  const snapshot = clientReadSnapshot({ scope, queryKey, data, updatedAt });
  if (!snapshot) return;
  const bytes = snapshot.bytes;
  const scopeKey = snapshotScopeKey(userId, scope, deployment);
  const key = `${scopeKey}:${JSON.stringify(queryKey)}`;
  await queueSnapshotWrite(
    userId,
    async () => {
      await db.transaction("rw", db.snapshots, async () => {
        const previous = await db.snapshots.get(key);
        if (!canReplaceClientSnapshot(previous, { updatedAt })) return;
        await db.snapshots.put({ key, scopeKey, userId, queryKey, data, updatedAt, bytes });
      });
      await pruneDiskCache();
    },
    deployment,
  );
}

export async function readPageSnapshots(
  userId: string,
  scopes: string[],
  deployment = pageCacheDeploymentKey(),
) {
  if (!scopes.length) return [];
  return db.snapshots
    .where("scopeKey")
    .anyOf(scopes.map((scope) => snapshotScopeKey(userId, scope, deployment)))
    .toArray();
}

export async function deletePageSnapshots(
  userId: string,
  scopes: string[],
  deployment = pageCacheDeploymentKey(),
) {
  if (!scopes.length) return;
  await queueSnapshotWrite(
    userId,
    async () => {
      await db.snapshots
        .where("scopeKey")
        .anyOf(scopes.map((scope) => snapshotScopeKey(userId, scope, deployment)))
        .delete();
    },
    deployment,
  );
}

export async function clearPageSnapshotsForDeployment(
  userId: string,
  deployment = pageCacheDeploymentKey(),
) {
  const prefix = `${deployment}:${userId}:`;
  const ownerKey = `${deployment}:${userId}`;
  blockedSnapshotUsers.add(ownerKey);
  await snapshotWriteTails.get(ownerKey)?.catch(() => undefined);
  const snapshots = await db.snapshots.where("userId").equals(userId).toArray();
  await db.snapshots.bulkDelete(
    snapshots.filter((snapshot) => snapshot.key.startsWith(prefix)).map((snapshot) => snapshot.key),
  );
}

export async function blockSnapshotWrites(userId: string, deployment = pageCacheDeploymentKey()) {
  const ownerKey = `${deployment}:${userId}`;
  blockedSnapshotUsers.add(ownerKey);
  await snapshotWriteTails.get(ownerKey)?.catch(() => undefined);
}

export const webClientCacheStorage: ClientCacheStorage = {
  session: {
    load: readCachedSession,
    write: (deployment, value) => rememberCachedSession(value, deployment),
    clear: clearCachedSession,
  },
  snapshots: {
    load: async (scope, scopes) =>
      (await readPageSnapshots(scope.userId, [...scopes], scope.deployment)).map((row) => ({
        ...row,
        scope: row.scopeKey.slice(`${scope.deployment}:${scope.userId}:`.length),
      })),
    write: (scope, row) =>
      rememberPageSnapshot(
        scope.userId,
        row.scope,
        [...row.queryKey],
        row.data,
        row.updatedAt,
        scope.deployment,
      ),
    delete: (scope, scopes) => deletePageSnapshots(scope.userId, [...scopes], scope.deployment),
    clear: (scope) => clearPageSnapshotsForDeployment(scope.userId, scope.deployment),
  },
  calendar: {
    open: async (identity) => calendarCacheStore(await openCalendarDatabase(identity)),
    clear: (identity) => destroyCalendarDatabase(calendarDatabaseName(identity)),
  },
};
