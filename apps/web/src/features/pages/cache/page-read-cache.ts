import { hydrateClientReadCache, subscribeClientReadCache } from "@zilobase/features/pages";
import type { QueryClient } from "@tanstack/react-query";
import { webClientCacheStorage } from "@/platform/storage/client-cache-storage";
import { pageCacheDeploymentKey } from "@/platform/storage/page-cache-database";

export async function hydratePageReadCache(input: {
  queryClient: QueryClient;
  userId: string;
  sessionId: string;
  pageId: string;
  workspaceId: string | null;
  databaseIds: string[];
}) {
  return hydrateClientReadCache({
    ...input,
    storage: webClientCacheStorage,
    scope: { deployment: pageCacheDeploymentKey(), userId: input.userId },
  });
}

export function subscribePageReadCache(
  queryClient: QueryClient,
  userId: string,
  sessionId: string,
) {
  return subscribeClientReadCache(queryClient, webClientCacheStorage, {
    deployment: pageCacheDeploymentKey(),
    userId,
    sessionId,
  });
}
