import {
  QueryClientProvider,
  useQuery,
  onlineManager,
  focusManager,
  type QueryClient,
} from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { useEffect } from "react";
import type { ClientCacheStorage } from "./cache-storage";
import { subscribeClientReadCache } from "../pages/read-cache";
import type { ApiFetcher } from "./api-fetcher";
import { defaultClientLifecycle, type ClientLifecycle } from "./lifecycle";
import { initializeZilobaseClient, type ClientDeployment } from "./client";
import { sessionQueryOptions } from "../auth/queries";
import { DatabaseSessionContext } from "../databases/queries/session";
import { retainDatabaseController } from "../databases/interactions/store";
export type { ClientLifecycle } from "./lifecycle";

export type { ApiFetcher } from "./api-fetcher";

import type { ZilobaseAuthClient } from "./auth-client";
export type { ZilobaseAuthClient } from "./auth-client";

export type ZilobaseFeaturesConfig = {
  deployment: ClientDeployment;
  cacheStorage?: ClientCacheStorage;
  apiFetch: ApiFetcher;
  auth: ZilobaseAuthClient;
  preferredActiveWorkspaceId?: string | null;
  queryClient: QueryClient;
  databaseRealtimeEnabled?: boolean;
  lifecycle?: ClientLifecycle;
  databasePresenceColor?: (userId: string) => string;
  setPreferredActiveWorkspaceId?: (workspaceId: string | null) => void;
};

const ZilobaseFeaturesContext = createContext<ZilobaseFeaturesConfig | null>(null);

export function ZilobaseFeaturesProvider({
  children,
  value,
}: React.PropsWithChildren<{ value: ZilobaseFeaturesConfig }>) {
  initializeZilobaseClient(value.queryClient, value.deployment);
  useEffect(() => {
    if (!value.lifecycle) return;
    const publish = () => {
      onlineManager.setOnline(value.lifecycle!.isOnline());
      focusManager.setFocused(value.lifecycle!.isVisible());
    };
    publish();
    return value.lifecycle.subscribe(publish);
  }, [value.lifecycle]);
  const { data: session } = useQuery(sessionQueryOptions(value.auth), value.queryClient);
  const userId = session?.user?.id;
  const sessionId = session?.session?.id;
  const lifecycle = value.lifecycle ?? defaultClientLifecycle;
  useEffect(
    () =>
      retainDatabaseController(value.queryClient, sessionId ?? "public", value.apiFetch, lifecycle),
    [value.queryClient, sessionId, value.apiFetch, lifecycle],
  );
  useEffect(() => {
    if (!value.cacheStorage || !userId || !sessionId) return;
    return subscribeClientReadCache(value.queryClient, value.cacheStorage, {
      deployment: typeof value.deployment === "function" ? value.deployment() : value.deployment,
      userId,
      sessionId,
    });
  }, [value.queryClient, value.cacheStorage, value.deployment, userId, sessionId]);
  return (
    <QueryClientProvider client={value.queryClient}>
      <ZilobaseFeaturesContext.Provider value={value}>
        <DatabaseSessionContext.Provider value={sessionId ?? "public"}>
          {children}
        </DatabaseSessionContext.Provider>
      </ZilobaseFeaturesContext.Provider>
    </QueryClientProvider>
  );
}

export function useZilobaseFeatures() {
  const value = useContext(ZilobaseFeaturesContext);

  if (!value) {
    throw new Error(
      "ZilobaseFeaturesProvider is missing. Wrap your app before using @zilobase/features hooks.",
    );
  }

  return value;
}
