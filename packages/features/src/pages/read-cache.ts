import { defaultUserSettings, userSettingsQueryKey } from "../user-settings/queries";
import type { UserSettings } from "../user-settings/contracts";
import type { Page } from "./contracts";
import type { EmbeddedItemsOpenAs } from "./item-relationships";
import { resolvePageDetailReference, type PageDetailReference } from "./cache";
import { resolveEmbeddedItemsOpenAs, pageQueryKey } from "./queries";
import { isPublishedFallbackPage } from "./publication";
import type { QueryClient } from "@tanstack/react-query";
import { pageReadSnapshotOf } from "./read-snapshot";
import { sharedClient } from "../data/client";
import {
  clientReadSnapshot,
  type ClientCacheScope,
  type ClientCacheStorage,
} from "../shared/cache-storage";

export type PageReadSnapshot = {
  queryKey: readonly unknown[];
  data: unknown;
  updatedAt: number;
};

export async function hydrateClientReadCache(input: {
  queryClient: QueryClient;
  storage: ClientCacheStorage;
  scope: ClientCacheScope;
  sessionId: string;
  pageId: string;
  workspaceId: string | null;
  databaseIds: string[];
}) {
  const owner = sharedClient(input.queryClient);
  const read = owner.capture();
  const scopes = [
    "user",
    `page:${input.pageId}`,
    ...input.databaseIds.map((id) => `database:${id}`),
  ];
  if (input.workspaceId) scopes.push(`workspace:${input.workspaceId}`);
  const snapshots = await input.storage.snapshots.load(input.scope, scopes);
  if (!owner.isCurrent(read)) return;
  hydratePageReadSnapshots(input.queryClient, input.sessionId, snapshots);
}

export function subscribeClientReadCache(
  queryClient: QueryClient,
  storage: ClientCacheStorage,
  scope: ClientCacheScope & { sessionId: string },
) {
  return subscribePageReadSnapshots(
    queryClient,
    scope.sessionId,
    (row) => {
      const snapshot = clientReadSnapshot(row);
      if (snapshot) void storage.snapshots.write(scope, snapshot).catch(() => undefined);
    },
    (denied) => {
      void storage.snapshots.delete(scope, [denied]).catch(() => undefined);
    },
  );
}

export function hydratePageReadSnapshots(
  queryClient: QueryClient,
  sessionId: string,
  snapshots: readonly PageReadSnapshot[],
) {
  for (const snapshot of snapshots) {
    const key = snapshot.queryKey;
    if (!key || !pageReadSnapshotOf(key, snapshot.data, sessionId)) continue;
    const existing = queryClient.getQueryState(key);
    if (existing?.dataUpdatedAt && existing.dataUpdatedAt >= snapshot.updatedAt) continue;
    queryClient.setQueryData(key, snapshot.data, { updatedAt: snapshot.updatedAt });
    void queryClient.invalidateQueries({ queryKey: key, exact: true, refetchType: "none" });
  }
}

export function subscribePageReadSnapshots(
  queryClient: QueryClient,
  sessionId: string,
  onSnapshot: (snapshot: PageReadSnapshot & { scope: string }) => void,
  onAccessDenied: (scope: string) => void,
) {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    if (event.action.type === "error") {
      const error = event.action.error;
      const status = error && typeof error === "object" && "status" in error ? error.status : null;
      if (status !== 401 && status !== 403 && status !== 404) return;
      const key = event.query.queryKey;
      const scope =
        key[0] === "db" && key[1] === sessionId && typeof key[2] === "string"
          ? `database:${key[2]}`
          : key[0] === "page" && typeof key[1] === "string"
            ? `page:${key[1]}`
            : null;
      if (!scope) return;
      onAccessDenied(scope);
      queryClient.removeQueries({ queryKey: key, exact: true });
      return;
    }
    if (event.action.type !== "success" || event.action.manual) return;
    const { queryKey, state } = event.query;
    const snapshot = pageReadSnapshotOf(queryKey, state.data, sessionId);
    if (!snapshot) return;
    onSnapshot({ ...snapshot, updatedAt: state.dataUpdatedAt });
  });
}

export function resolveEmbeddedItemsOpenAsFromCache(
  queryClient: QueryClient,
  hostPageId: string | null | undefined,
  fallbackPage: Page | null | undefined,
  readPublishedPreference: () => EmbeddedItemsOpenAs,
) {
  const userSettings =
    queryClient.getQueryData<UserSettings>(userSettingsQueryKey) ?? defaultUserSettings;
  const page =
    resolvePageDetailReference(
      queryClient,
      queryClient.getQueryData<PageDetailReference | null>(pageQueryKey(hostPageId)),
    )?.page ?? fallbackPage;

  if (isPublishedFallbackPage(page)) {
    return readPublishedPreference();
  }

  return resolveEmbeddedItemsOpenAs(userSettings.embeddedItemsOpenAs);
}
