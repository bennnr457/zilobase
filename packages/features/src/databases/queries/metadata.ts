import { getDatabaseTitleSource } from "../views/appearance";
import { useEffect, useMemo } from "react";
import { composeDatabaseViewData } from "../views/source-state";
import { useDatabaseBootstrap } from "./bootstrap-react";
import { useDatabaseRecords } from "./records-react";
export function useDatabaseMetadata(
  databaseId: string | null | undefined,
  options?: {
    dataSourceId?: string | null;
    includeDeleted?: boolean;
    viewId?: string | null;
  },
) {
  const bootstrap = useDatabaseBootstrap(
    databaseId
      ? {
          databaseId,
          includeDeleted: options?.includeDeleted,
          viewId: options?.viewId,
        }
      : null,
  );
  const data = useMemo(() => {
    if (!bootstrap.data) return undefined;

    const activeDataSource =
      bootstrap.data.dataSources.find((source) => source.id === options?.dataSourceId) ??
      getDatabaseTitleSource(bootstrap.data.dataSources, bootstrap.data.views, options?.viewId);

    return {
      ...bootstrap.data,
      activeDataSource,
      displayName: activeDataSource?.name ?? bootstrap.data.database.name,
    };
  }, [bootstrap.data, options?.dataSourceId, options?.viewId]);

  return {
    data,
    error: bootstrap.error,
    isError: bootstrap.status === "error",
    isLoading: bootstrap.status === "loading",
    refetch: bootstrap.refetch,
  };
}

export function useDatabaseSecondaryPayload(
  databaseId: string | null | undefined,
  options?: {
    enabled?: boolean;
    includeDeleted?: boolean;
    loadAll?: boolean;
  },
) {
  const metadata = useDatabaseMetadata(databaseId, {
    includeDeleted: options?.includeDeleted,
  });
  const activeDataSourceId = metadata.data?.activeDataSource?.id ?? null;
  const view =
    metadata.data?.views.find((candidate) => candidate.dataSourceId === activeDataSourceId) ?? null;
  const records = useDatabaseRecords(
    (options?.enabled ?? true) && databaseId && activeDataSourceId && view
      ? {
          databaseId,
          dataSourceId: activeDataSourceId,
          includeDeleted: options?.includeDeleted,
          viewId: view.id,
        }
      : null,
  );
  useEffect(() => {
    if (
      !options?.loadAll ||
      options.enabled === false ||
      records.status !== "success" ||
      !records.hasMore ||
      records.isFetchingNextPage
    ) {
      return;
    }
    void records.fetchNextPage();
  }, [
    options?.loadAll,
    options?.enabled,
    records.fetchNextPage,
    records.hasMore,
    records.isFetchingNextPage,
    records.records.length,
    records.status,
  ]);

  const data = useMemo(() => {
    if (options?.enabled === false) return undefined;
    if (!metadata.data || !activeDataSourceId || !view) return undefined;
    if (records.status !== "success") return undefined;

    return composeDatabaseViewData({
      bootstrap: metadata.data,
      dataSourceId: activeDataSourceId,
      hasMore: records.hasMore,
      records: records.records,
      totalCount: records.totalCount,
    });
  }, [
    activeDataSourceId,
    metadata.data,
    options?.enabled,
    records.hasMore,
    records.records,
    records.status,
    records.totalCount,
    view,
  ]);

  const enabled = options?.enabled ?? true;
  const loadingAll = Boolean(enabled && options?.loadAll && records.hasMore);

  return {
    data,
    error: metadata.error ?? records.error,
    fetchNextPage: records.fetchNextPage,
    hasMore: records.hasMore,
    isComplete: enabled && records.status === "success" && !records.hasMore,
    isFetchingNextPage: records.isFetchingNextPage,
    isLoading: enabled && (metadata.isLoading || records.status === "loading" || loadingAll),
  };
}
