import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSharedDataRevision } from "../../data/react";
import { useZilobaseFeatures } from "../../shared/context";
import { resolveDatabaseBootstrap } from "../cache-references";
import { useProjectedDatabaseBootstrap } from "../interactions/react";
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

  const query = useQuery({
    ...databaseBootstrapQueryOptions(
      apiFetch,
      sessionId,
      scope ?? { databaseId: "disabled" },
      queryClient,
    ),
    enabled: Boolean(scope),
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
  const projected = useProjectedDatabaseBootstrap(resolved);

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
    status: query.isError ? "error" : query.isLoading ? "loading" : query.data ? "success" : "idle",
  };
}
