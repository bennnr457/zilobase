import { useCallback, useMemo } from "react";
import { useSession } from "../../auth/react";
import { usePagePersonAccessTargets } from "../../pages/query-hooks";
import { useZilobaseFeatures } from "../../shared/context";
import type { DatabaseBootstrapResponse } from "../core/entities";
import { useProjectedDatabaseRecords } from "../interactions/react";
import { deriveDatabaseViewModel } from "../views/model";
import { databaseViewQueryHash } from "../views/query-hash";
import { composeDatabaseViewData } from "../views/source-state";
import { getDatabaseInitialPageSize } from "../views/view-evaluation";
import { prefetchDatabaseWindow } from "./records";
import { useDatabaseRecords } from "./records-react";
import { useDatabaseSessionId } from "./session";

export function useDatabaseViewData({
  databaseId,
  bootstrap,
  serverBootstrap,
  activeViewId,
  includeDeleted,
}: {
  databaseId: string | null | undefined;
  bootstrap: DatabaseBootstrapResponse | undefined;
  serverBootstrap: DatabaseBootstrapResponse | undefined;
  activeViewId: string | null;
  includeDeleted: boolean;
}) {
  const databaseDeleted = Boolean(bootstrap?.database.deletedAt);
  const activeDataSourceId =
    bootstrap?.views.find(({ id }) => id === activeViewId)?.dataSourceId ??
    bootstrap?.dataSources[0]?.id ??
    null;
  const recordWindow = useDatabaseRecords(
    databaseId && !databaseDeleted && activeViewId && activeDataSourceId
      ? {
          databaseId,
          dataSourceId: activeDataSourceId,
          includeDeleted: includeDeleted,
          viewId: activeViewId,
        }
      : null,
  );
  const projectedRecords = useProjectedDatabaseRecords({
    databaseId,
    dataSourceId: activeDataSourceId,
    sourceVersion: recordWindow.dataSourceVersion,
    records: recordWindow.records,
  });
  const viewData = useMemo(
    () =>
      composeDatabaseViewData({
        bootstrap,
        dataSourceId: activeDataSourceId,
        hasMore: recordWindow.hasMore,
        records: projectedRecords,
        totalCount: recordWindow.totalCount,
      }),
    [
      activeDataSourceId,
      bootstrap,
      recordWindow.hasMore,
      projectedRecords,
      recordWindow.totalCount,
    ],
  );
  const activeProperties = useMemo(
    () =>
      (viewData?.bootstrap.properties ?? []).filter(
        (property) => property.dataSourceId === viewData?.dataSourceId,
      ),
    [viewData],
  );
  const { data: session } = useSession();
  const needsPersonAccessTargets = useMemo(
    () => activeProperties.some((property) => property.property.type === "person"),
    [activeProperties],
  );
  const { data: accessTargets } = usePagePersonAccessTargets(viewData?.bootstrap.database.pageId, {
    enabled: needsPersonAccessTargets,
  });
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();
  const prefetchDatabaseView = useCallback(
    (viewId: string) => {
      if (!databaseId || !bootstrap || viewId === activeViewId) return;
      const view = serverBootstrap?.views.find((candidate) => candidate.id === viewId);
      if (!view) return;
      void prefetchDatabaseWindow(
        queryClient,
        apiFetch,
        sessionId,
        {
          databaseId,
          dataSourceId: view.dataSourceId,
          includeDeleted: includeDeleted,
          queryHash: databaseViewQueryHash(
            view.config ?? serverBootstrap?.database.config,
            includeDeleted,
          ),
          viewId: view.id,
        },
        getDatabaseInitialPageSize(view.config ?? bootstrap.database.config),
      );
    },
    [
      apiFetch,
      bootstrap,
      serverBootstrap,
      databaseId,
      includeDeleted,
      queryClient,
      activeViewId,
      sessionId,
    ],
  );

  const model = useMemo(
    () =>
      deriveDatabaseViewModel({
        accessTargets,
        activeViewId,
        currentUserId: session?.user?.id,
        viewData,
      }),
    [accessTargets, activeViewId, session?.user?.id, viewData],
  );
  return {
    activeDataSourceId,
    recordWindow,
    viewData,
    activeProperties,
    model,
    prefetchDatabaseView,
  };
}
