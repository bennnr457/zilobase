import type { QueryClient } from "@tanstack/react-query";
import { sessionQueryKey } from "../auth/queries";
import type { SessionResponse } from "../auth/contracts";
import { disposeSharedClient, installSharedClient } from "../data/client";
import { disposeDatabaseControllers } from "../databases/interactions/store";
import { createZilobaseQueryClient } from "./query-client";

export type ClientDeployment = string | (() => string);

/** Used by both pre-render reads and the React composition. */
export function initializeZilobaseClient(queryClient: QueryClient, deployment: ClientDeployment) {
  return installSharedClient(queryClient, () => {
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
  });
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
      queryClient.clear();
    },
  };
}
