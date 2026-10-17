import { sharedClient, type SharedClient } from "../data/client";
import type { QueryClient } from "@tanstack/react-query";

import type { ApiFetcher } from "./api-fetcher";
import { databaseAccessQueryKey } from "../databases/queries/queries";
import {
  cachePageDetail,
  readCachedPage,
  updatePageContexts,
  type PageDetailReference,
} from "../pages/cache";
import { pagesNavRootQueryKey, pageQueryKey } from "../pages/queries";
import type { Page } from "../pages/contracts";

export type DeletedItemIds = {
  deletedDatabaseIds: string[];
  deletedPageIds: string[];
};

export type RestoredItemIds = {
  restoredDatabaseIds: string[];
  restoredPageIds: string[];
};

export function isPageFavoriteInCache(
  queryClient: QueryClient,
  pageId: string,
  workspaceId?: string | null,
) {
  return Boolean(getPageFromCache(queryClient, pageId, workspaceId)?.isFavorite);
}

export async function favoritePages({
  apiFetch,
  pageIds,
  queryClient,
}: {
  apiFetch: ApiFetcher;
  workspaceId: string;
  pageIds: string[];
  queryClient: QueryClient;
}) {
  const uniquePageIds = [...new Set(pageIds)].filter(Boolean);

  if (uniquePageIds.length === 0) {
    return;
  }

  const read = await sharedClient(queryClient).captureRead();
  const results = await Promise.all(
    uniquePageIds.map((pageId) =>
      apiFetch<{ page: Page }>(`/pages/${pageId}/favorite`, {
        method: "PUT",
      }),
    ),
  );

  for (const { page } of results) {
    setPageDetailCache(queryClient, page, read);
    updatePageContexts(queryClient, page.id, { isFavorite: page.isFavorite }, read);
  }
}

export async function invalidateDeletedItems({
  workspaceId,
  queryClient,
  result,
  isCurrent = () => true,
}: {
  workspaceId: string | null | undefined;
  queryClient: QueryClient;
  result: DeletedItemIds;
  isCurrent?: () => boolean;
}) {
  if (!workspaceId || !isCurrent()) {
    return;
  }

  await queryClient.invalidateQueries({
    queryKey: pagesNavRootQueryKey(workspaceId),
  });

  for (const databaseId of result.deletedDatabaseIds) {
    if (!isCurrent()) return;
    await queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === "db" &&
        query.queryKey.includes(databaseId) &&
        query.queryKey[query.queryKey.length - 1] === true,
    });
    if (!isCurrent()) return;
    queryClient.removeQueries({
      predicate: (query) =>
        query.queryKey[0] === "db" &&
        query.queryKey.includes(databaseId) &&
        query.queryKey[query.queryKey.length - 1] !== true,
    });
    queryClient.removeQueries({
      queryKey: databaseAccessQueryKey(databaseId),
    });
  }

  for (const pageId of result.deletedPageIds) {
    if (!isCurrent()) return;
    queryClient.removeQueries({ queryKey: pageQueryKey(pageId) });
  }
  await invalidatePageMemberships(queryClient, result.deletedPageIds, isCurrent);
}

export async function invalidateRestoredItems({
  workspaceId,
  queryClient,
  result,
  isCurrent = () => true,
}: {
  workspaceId: string;
  queryClient: QueryClient;
  result: RestoredItemIds;
  isCurrent?: () => boolean;
}) {
  if (!isCurrent()) return;
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: pagesNavRootQueryKey(workspaceId),
    }),
    ...result.restoredDatabaseIds.map((databaseId) =>
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === "db" && query.queryKey.includes(databaseId),
      }),
    ),
    ...result.restoredDatabaseIds.map((databaseId) =>
      queryClient.invalidateQueries({
        queryKey: databaseAccessQueryKey(databaseId),
      }),
    ),
    ...result.restoredPageIds.map((pageId) =>
      queryClient.invalidateQueries({ queryKey: pageQueryKey(pageId) }),
    ),
  ]);
  await invalidatePageMemberships(queryClient, result.restoredPageIds, isCurrent, workspaceId);
}

async function invalidatePageMemberships(
  queryClient: QueryClient,
  pageIds: string[],
  isCurrent: () => boolean,
  restoredWorkspaceId?: string,
) {
  if (!isCurrent() || !pageIds.length) return;
  // A restored page may have no remaining cached membership after trash or reload.
  const client = sharedClient(queryClient);
  const owners = client.all();
  const sources = new Set(owners.flatMap((owner) => owner.databases.sourcesForPages(pageIds)));
  const missingRestoredMembership =
    restoredWorkspaceId &&
    pageIds.some(
      (pageId) => !owners.some((owner) => owner.databases.sourcesForPages([pageId]).length),
    );
  await queryClient.invalidateQueries({
    queryKey: ["db"],
    predicate: (query) => {
      if (!isCurrent() || query.queryKey[3] !== "window") return false;
      if (sources.has(String(query.queryKey[4]))) return true;
      return Boolean(
        missingRestoredMembership &&
        client.database(String(query.queryKey[2]), String(query.queryKey[1]))?.session.scope
          .workspaceId === restoredWorkspaceId,
      );
    },
  });
}

export function setPageDetailCache(
  queryClient: QueryClient,
  page: Page,
  read: ReturnType<SharedClient["capture"]> = sharedClient(queryClient).capture(),
) {
  const current = queryClient.getQueryData<PageDetailReference | null>(pageQueryKey(page.id));
  cachePageDetail(
    queryClient,
    {
      ...current,
      page,
      accessLevel: current?.accessLevel ?? null,
      databaseIds: current?.databaseIds ?? [],
    },
    read,
  );
}

function getPageFromCache(queryClient: QueryClient, pageId: string, _workspaceId?: string | null) {
  return readCachedPage(queryClient, pageId);
}
