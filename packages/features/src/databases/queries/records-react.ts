import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useSharedDataRevision } from "../../data/react";
import { useZilobaseFeatures } from "../../shared/context";
import { resolveDatabaseBootstrap, resolveRecordWindow } from "../cache-references";
import { databaseViewQueryHash } from "../views/query-hash";
import { getDatabaseInitialPageSize } from "../views/view-evaluation";
import { databaseWindowQueryKey } from "./keys";
import {
  confirmedWindowBootstrap,
  databaseWindowQueryOptions,
  selectSameSourcePlaceholder,
  type DatabaseRecordHookWindow,
  type DatabaseViewScope,
} from "./records";
import { useDatabaseSessionId } from "./session";
export function useDatabaseRecords(
  requestedScope: Omit<DatabaseViewScope, "queryHash"> | null,
): DatabaseRecordHookWindow {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

  const hostId = requestedScope?.databaseId;
  const subscribe = useCallback(
    (notify: () => void) =>
      queryClient.getQueryCache().subscribe((event) => {
        const key = event.query.queryKey;
        // Observer registration and record-query creation can occur during another
        // component's render. Only actual metadata changes affect this snapshot.
        if (
          (event.type === "updated" || event.type === "removed") &&
          key[0] === "db" &&
          key[1] === sessionId &&
          key[2] === hostId &&
          key[3] === "bootstrap"
        )
          notify();
      }),
    [queryClient, sessionId, hostId],
  );
  const getSnapshot = () => confirmedWindowBootstrap(queryClient, sessionId, requestedScope);
  const bootstrapReference = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const revision = useSharedDataRevision(queryClient);
  const bootstrap = useMemo(
    () => resolveDatabaseBootstrap(queryClient, bootstrapReference, true),
    [queryClient, bootstrapReference, revision],
  );
  const view = bootstrap?.views.find(
    ({ id, dataSourceId }) =>
      id === requestedScope?.viewId && dataSourceId === requestedScope.dataSourceId,
  );
  const scope =
    requestedScope && view
      ? {
          ...requestedScope,
          queryHash: databaseViewQueryHash(
            view.config ?? bootstrap?.database.config,
            requestedScope.includeDeleted,
          ),
        }
      : null;
  const pageSize = getDatabaseInitialPageSize(view?.config ?? bootstrap?.database.config);

  const queryKey = scope ? databaseWindowQueryKey(sessionId, scope) : null;

  const options = infiniteQueryOptions({
    ...databaseWindowQueryOptions(
      apiFetch,
      sessionId,
      scope ?? {
        databaseId: "disabled",
        dataSourceId: "disabled",
        queryHash: "disabled",
        viewId: "disabled",
      },
      pageSize,
      queryClient,
    ),
    enabled: Boolean(scope),
    queryKey: (queryKey ??
      databaseWindowQueryKey(sessionId, {
        databaseId: "disabled",
        dataSourceId: "disabled",
        queryHash: "disabled",
      })) as ReturnType<typeof databaseWindowQueryKey>,
    placeholderData: (previousData, previousQuery) =>
      scope
        ? selectSameSourcePlaceholder(
            previousData,
            (previousQuery as { queryKey?: readonly unknown[] } | undefined)?.queryKey,
            scope.dataSourceId,
          )
        : previousData,
    staleTime: 30_000,
  });
  const query = useInfiniteQuery(options);

  if (!scope) {
    return {
      databaseVersion: null,
      dataSourceVersion: null,
      error: null,
      fetchNextPage: async () => undefined,
      hasMore: false,
      isFetching: false,
      isFetchingNextPage: false,
      isPlaceholderData: false,
      pageSize: 50,
      records: [],
      scope: null,
      status: requestedScope ? "loading" : "idle",
      totalCount: 0,
    };
  }

  const latest = resolveRecordWindow(queryClient, query.data?.pages.at(-1));
  const error =
    query.error instanceof Error
      ? query.error
      : query.error
        ? new Error(String(query.error))
        : null;

  return {
    dataSourceVersion: query.isPlaceholderData ? null : (latest?.dataSourceVersion ?? null),
    databaseVersion: query.isPlaceholderData ? null : (latest?.databaseVersion ?? null),
    error,
    fetchNextPage: async () => {
      await query.fetchNextPage();
    },
    hasMore: latest?.hasMore ?? false,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    isPlaceholderData: query.isPlaceholderData,
    pageSize,
    records: latest?.records ?? [],
    scope,
    status: query.isError ? "error" : query.isLoading ? "loading" : latest ? "success" : "idle",
    totalCount: latest?.totalCount ?? 0,
  };
}
