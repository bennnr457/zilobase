import type { QueryClient } from "@tanstack/react-query";
import type { SessionResponse } from "../auth/contracts";
import { sessionQueryKey } from "../auth/queries";
import { disposeMemoryCalendarStorage } from "../calendar/memory-storage";
import { disposeSharedClient, installSharedClient } from "../data/client";
import {
  disposeDatabaseControllers,
  retainDatabaseController,
} from "../databases/interactions/store";
import type { ClientOperationContext } from "./operation-context";
import { createZilobaseQueryClient } from "./query-client";

export type ClientDeployment = string | (() => string);
const runtimes = new WeakMap<
  QueryClient,
  {
    ports?: ClientOperationContext;
    release?: () => void;
    unsubscribe?: () => void;
    key?: string;
  }
>();

/** Used by both pre-render reads and the React composition. */
export function initializeZilobaseClient(
  queryClient: QueryClient,
  deployment: ClientDeployment,
  ports?: ClientOperationContext,
) {
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
  let runtime = runtimes.get(queryClient);
  if (!runtime) {
    runtime = {};
    runtimes.set(queryClient, runtime);
  }
  const owner = runtime;
  ports ??= owner.ports;
  const retain = () => {
    const current = identity();
    const key = JSON.stringify(current);
    if (
      owner.key === key &&
      owner.ports?.apiFetch === ports?.apiFetch &&
      owner.ports?.lifecycle === ports?.lifecycle
    )
      return;
    owner.release?.();
    owner.key = key;
    owner.ports = ports;
    owner.release = ports
      ? retainDatabaseController(
          queryClient,
          current.viewer.kind === "account" ? current.viewer.sessionId : "public",
          ports.apiFetch,
          ports.lifecycle,
        )
      : undefined;
  };
  data.configure(identity, () => {
    owner.release?.();
    owner.key = undefined;
    disposeDatabaseControllers(queryClient);
    disposeMemoryCalendarStorage(queryClient);
    const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== "session";
    for (const query of queryClient.getQueryCache().findAll({ predicate })) {
      // Removed requests can settle after destroy; do not leave an orphan GC timer.
      if (!query.isActive()) query.setOptions({ ...query.options, gcTime: Infinity });
    }
    // Reset mounted observers as well as retained results; canceled old requests cannot republish.
    void queryClient.resetQueries({ predicate }).catch(() => undefined);
    queryClient.removeQueries({ predicate: (query) => predicate(query) && !query.isActive() });
    queryClient.getMutationCache().clear();
    retain();
  });
  // Provider renders can refresh ports without adding subscriptions or owners.
  owner.unsubscribe?.();
  owner.unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryKey[0] === "session") {
      data.capture();
      retain();
    }
  });
  data.capture();
  retain();
  return data;
}

export function createZilobaseClient(
  input: {
    deployment: ClientDeployment;
    queryClient?: QueryClient;
  } & Partial<Omit<ClientOperationContext, "queryClient">>,
) {
  const queryClient = input.queryClient ?? createZilobaseQueryClient();
  initializeZilobaseClient(
    queryClient,
    input.deployment,
    input.apiFetch ? { ...input, apiFetch: input.apiFetch, queryClient } : undefined,
  );
  return {
    queryClient,
    dispose() {
      const owner = runtimes.get(queryClient);
      owner?.unsubscribe?.();
      owner?.release?.();
      runtimes.delete(queryClient);
      disposeDatabaseControllers(queryClient);
      disposeMemoryCalendarStorage(queryClient);
      disposeSharedClient(queryClient);
      for (const query of queryClient.getQueryCache().getAll())
        query.setOptions({ ...query.options, gcTime: Infinity });
      queryClient.clear();
    },
  };
}
