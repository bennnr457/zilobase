import { pageReadSnapshotOf } from "@zilobase/features/pages";
import type { QueryClient } from "@tanstack/react-query";

import {
  deletePageSnapshots,
  readPageSnapshots,
  rememberPageSnapshot,
} from "@/features/editor/collaboration/page-document-cache";

export async function hydratePageReadCache(input: {
  queryClient: QueryClient;
  userId: string;
  sessionId: string;
  pageId: string;
  workspaceId: string | null;
  databaseIds: string[];
}) {
  const { queryClient, userId, sessionId, pageId, workspaceId, databaseIds } = input;
  const scopes = ["user", `page:${pageId}`, ...databaseIds.map((id) => `database:${id}`)];
  if (workspaceId) scopes.push(`workspace:${workspaceId}`);
  const snapshots = await readPageSnapshots(userId, scopes);
  for (const snapshot of snapshots) {
    const key = snapshot.queryKey;
    if (!key || !pageReadSnapshotOf(key, snapshot.data, sessionId)) continue;
    const existing = queryClient.getQueryState(key);
    if (existing?.dataUpdatedAt && existing.dataUpdatedAt >= snapshot.updatedAt) continue;
    queryClient.setQueryData(key, snapshot.data, { updatedAt: snapshot.updatedAt });
    void queryClient.invalidateQueries({ queryKey: key, exact: true, refetchType: "none" });
  }
}

export function subscribePageReadCache(
  queryClient: QueryClient,
  userId: string,
  sessionId: string,
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
      void deletePageSnapshots(userId, [scope]).catch(() => undefined);
      queryClient.removeQueries({ queryKey: key, exact: true });
      return;
    }
    if (event.action.type !== "success" || event.action.manual) return;
    const { queryKey, state } = event.query;
    const snapshot = pageReadSnapshotOf(queryKey, state.data, sessionId);
    if (!snapshot) return;
    void rememberPageSnapshot(
      userId,
      snapshot.scope,
      snapshot.queryKey,
      snapshot.data,
      state.dataUpdatedAt,
    ).catch(() => undefined);
  });
}
