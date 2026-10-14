import { QueryClientProvider, useQuery, type QueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import type { ApiFetcher } from "./api-fetcher";
import type { ClientLifecycle } from "./lifecycle";
import { initializeZilobaseClient, type ClientDeployment } from "./client";
import { sessionQueryOptions } from "../auth/queries";
import { DbProvider } from "../databases/queries/session";
export type { ClientLifecycle } from "./lifecycle";

export type { ApiFetcher } from "./api-fetcher";

import type { ZilobaseAuthClient } from "./auth-client";
export type { ZilobaseAuthClient } from "./auth-client";

export type ZilobaseFeaturesConfig = {
  deployment: ClientDeployment;
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
  return (
    <QueryClientProvider client={value.queryClient}>
      <ZilobaseFeaturesContext.Provider value={value}>
        <SessionDatabaseProvider value={value}>{children}</SessionDatabaseProvider>
      </ZilobaseFeaturesContext.Provider>
    </QueryClientProvider>
  );
}

function SessionDatabaseProvider({
  children,
  value,
}: React.PropsWithChildren<{ value: ZilobaseFeaturesConfig }>) {
  const { data: session } = useQuery(sessionQueryOptions(value.auth));
  return (
    <DbProvider
      apiFetch={value.apiFetch}
      queryClient={value.queryClient}
      sessionId={session?.session?.id ?? null}
      lifecycle={value.lifecycle}
    >
      {children}
    </DbProvider>
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
