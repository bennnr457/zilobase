import { hydratePageReadSnapshots, subscribePageReadSnapshots } from "@zilobase/features/pages";
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
  hydratePageReadSnapshots(queryClient, sessionId, snapshots);
}

export function subscribePageReadCache(
  queryClient: QueryClient,
  userId: string,
  sessionId: string,
) {
  return subscribePageReadSnapshots(
    queryClient,
    sessionId,
    (snapshot) => {
      void rememberPageSnapshot(
        userId,
        snapshot.scope,
        [...snapshot.queryKey],
        snapshot.data,
        snapshot.updatedAt,
      ).catch(() => undefined);
    },
    (scope) => {
      void deletePageSnapshots(userId, [scope]).catch(() => undefined);
    },
  );
}
