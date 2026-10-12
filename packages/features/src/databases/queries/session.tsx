import type { QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type PropsWithChildren } from "react";

import type { ApiFetcher } from "../../shared/api-fetcher";
import { defaultClientLifecycle, type ClientLifecycle } from "../../shared/lifecycle";
import { retainDatabaseController } from "../interactions/store";

const DatabaseSessionContext = createContext<string | null>(null);

export function useDatabaseSessionId(): string {
  return useContext(DatabaseSessionContext) ?? "public";
}

export type DbProviderProps = PropsWithChildren<{
  apiFetch: ApiFetcher;
  queryClient: QueryClient;
  sessionId: string | null;
  lifecycle?: ClientLifecycle;
}>;

export function DbProvider({
  children,
  queryClient,
  sessionId,
  apiFetch,
  lifecycle = defaultClientLifecycle,
}: DbProviderProps) {
  useEffect(
    () => retainDatabaseController(queryClient, sessionId ?? "public", apiFetch, lifecycle),
    [queryClient, sessionId, apiFetch, lifecycle],
  );

  return (
    <DatabaseSessionContext.Provider value={sessionId ?? "public"}>
      {children}
    </DatabaseSessionContext.Provider>
  );
}
