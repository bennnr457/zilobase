import type { QueryClient } from "@tanstack/react-query";
import { sessionQueryKey } from "../auth/queries";
import type { SessionResponse } from "../auth/contracts";
import { disposeSharedClient, installSharedClient } from "../data/client";
import { disposeDatabaseControllers } from "../databases/interactions/store";
import { createZilobaseQueryClient } from "./query-client";

export type ClientDeployment = string | (() => string);

/** Used by both pre-render reads and the React composition. */
export function initializeZilobaseClient(queryClient: QueryClient, deployment: ClientDeployment) {
  const identity = () => {
    const session = queryClient.getQueryData<SessionResponse>(sessionQueryKey);
    return {
      deployment: typeof deployment === "function" ? deployment() : deployment,
      viewer:
        session?.user && session.session
          ? {
              kind: "account" as const,
              accountId: session.user.id,
              actorId: session.user.id,
              sessionId: session.session.id,
            }
          : { kind: "public" as const, capabilityId: "unauthenticated" },
    };
  };
  const data = installSharedClient(queryClient, identity);
  data.configure(identity, () => {
    disposeDatabaseControllers(queryClient);
    const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== "session";
    for (const query of queryClient.getQueryCache().findAll({ predicate })) {
      // Removed requests can settle after destroy; do not leave an orphan GC timer.
      if (!query.isActive()) query.setOptions({ ...query.options, gcTime: Infinity });
    }
    // Reset mounted observers as well as retained results; canceled old requests cannot republish.
    void queryClient.resetQueries({ predicate }).catch(() => undefined);
    queryClient.removeQueries({ predicate: (query) => predicate(query) && !query.isActive() });
    queryClient.getMutationCache().clear();
  });
  return data;
}

export function createZilobaseClient(input: {
  deployment: ClientDeployment;
  queryClient?: QueryClient;
}) {
  const queryClient = input.queryClient ?? createZilobaseQueryClient();
  initializeZilobaseClient(queryClient, input.deployment);
  return {
    queryClient,
    dispose() {
      disposeDatabaseControllers(queryClient);
      disposeSharedClient(queryClient);
      for (const query of queryClient.getQueryCache().getAll())
        query.setOptions({ ...query.options, gcTime: Infinity });
      queryClient.clear();
    },
  };
}
