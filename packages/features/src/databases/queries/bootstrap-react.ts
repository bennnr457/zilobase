import { useQuery } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";
import { useSharedDataRevision } from "../../data/react";
import { useZilobaseFeatures } from "../../shared/context";
import { resolveDatabaseBootstrap } from "../cache-references";
import { useDatabaseController, useProjectedDatabaseBootstrap } from "../interactions/react";
import {
  databaseBootstrapQueryOptions,
  type DatabaseBootstrapHookState,
  type DatabaseScope,
} from "./bootstrap";
import { databaseBootstrapQueryKey } from "./keys";
import { useDatabaseSessionId } from "./session";
export function useDatabaseBootstrap(scope: DatabaseScope | null): DatabaseBootstrapHookState {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();
  const queryKey = scope ? databaseBootstrapQueryKey(sessionId, scope) : null;

  const controller = useDatabaseController();
  const intentions = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const creation = intentions.find((item) => item.creation?.database.id === scope?.databaseId);
  const creating = Boolean(creation && creation.status !== "committed");
  const creationFailed = Boolean(scope && controller.creationFailed(scope.databaseId));
  const query = useQuery({
    ...databaseBootstrapQueryOptions(
      apiFetch,
      sessionId,
      scope ?? { databaseId: "disabled" },
      queryClient,
    ),
    enabled: Boolean(scope) && !creating && !creationFailed,
  });
  const revision = useSharedDataRevision(queryClient);
  const resolved = useMemo(
    () => resolveDatabaseBootstrap(queryClient, query.data),
    [queryClient, query.data, revision],
  );
  const confirmed = useMemo(
    () => resolveDatabaseBootstrap(queryClient, query.data, true),
    [queryClient, query.data, revision],
  );
  const projected = useProjectedDatabaseBootstrap(resolved, scope?.databaseId);

  if (!scope || !queryKey) {
    return {
      data: undefined,
      error: null,
      refetch: async () => undefined,
      scope: null,
      status: "idle",
    };
  }

  const error =
    query.error instanceof Error
      ? query.error
      : query.error
        ? new Error(String(query.error))
        : null;

  return {
    data: projected,
    serverData: confirmed,
    error,
    refetch: () => queryClient.refetchQueries({ exact: true, queryKey }),
    scope,
    status: query.isError ? "error" : projected ? "success" : query.isLoading ? "loading" : "idle",
  };
}
