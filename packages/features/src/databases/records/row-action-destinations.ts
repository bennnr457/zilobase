import { useQueries } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";
import { usePageNavigation } from "../../pages/query-hooks";
import { pageQueryOptions } from "../../pages/queries";
import { resolvePageDetailReference } from "../../pages/cache";
import { databaseBootstrapQueryOptions } from "../queries/bootstrap";
import { useDatabaseSessionId } from "../queries/session";
import { resolveDatabaseBootstrap } from "../cache-references";

/** Bound destination permission reads to the current search result window. */
export function useDatabaseRowMoveDestinations({
  workspaceId,
  enabled,
  search,
  pageIds,
  dataSourceId,
}: {
  workspaceId?: string | null;
  enabled: boolean;
  search: string;
  pageIds: string[];
  dataSourceId?: string | null;
}) {
  const { queryClient, apiFetch } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();
  const navigation = usePageNavigation(workspaceId, { enabled });
  const query = search.trim().toLowerCase();
  const pages = (navigation.data?.pages ?? [])
    .filter(
      (page) =>
        !pageIds.includes(page.id) && (page.name || "Untitled").toLowerCase().includes(query),
    )
    .slice(0, 50);
  const databases = (navigation.data?.databases ?? [])
    .filter((database) =>
      `${database.name} ${database.dataSources?.map((source) => source.name).join(" ") ?? ""}`
        .toLowerCase()
        .includes(query),
    )
    .slice(0, 30);
  const pageAccess = useQueries({
    queries: pages.map((page) => ({ ...pageQueryOptions(apiFetch, page.id), enabled })),
  });
  const databaseAccess = useQueries({
    queries: databases.map((database) => ({
      ...databaseBootstrapQueryOptions(
        apiFetch,
        sessionId,
        { databaseId: database.id },
        queryClient,
      ),
      enabled,
    })),
  });
  return {
    pages: pages.filter((_, index) => {
      const detail = resolvePageDetailReference(queryClient, pageAccess[index]?.data);
      return (
        detail &&
        (detail.accessLevel === "full" || detail.accessLevel === "edit") &&
        !detail.page.metadata?.locked
      );
    }),
    databases: databases.flatMap((database, index) => {
      const bootstrap = resolveDatabaseBootstrap(queryClient, databaseAccess[index]?.data);
      return bootstrap && ["full", "edit"].includes(bootstrap.database.accessLevel ?? "")
        ? bootstrap.dataSources
            .filter((source) => source.id !== dataSourceId)
            .map((source) => ({ database, source }))
        : [];
    }),
    isLoading:
      navigation.isLoading ||
      pageAccess.some((result) => result.isPending) ||
      databaseAccess.some((result) => result.isPending),
    isError:
      navigation.isError ||
      pageAccess.some((result) => result.isError) ||
      databaseAccess.some((result) => result.isError),
    refetch: async () => {
      await navigation.refetch();
      await Promise.all(pageAccess.map((result) => result.refetch()));
      await Promise.all(databaseAccess.map((result) => result.refetch()));
    },
  };
}
