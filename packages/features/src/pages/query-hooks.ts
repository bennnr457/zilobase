import { useDatabaseController } from "../databases/interactions/react";
import { parseActiveWorkspaceMismatchError } from "../shared/api-errors";
import { resolvePageAccessReferences } from "./access-references";
import { projectPagePropertyIntentions, readCachedPagePropertyCoverage } from "./property-cache";
import { useMemo, useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useSharedDataRevision } from "../data/react";
import { resolveNavigationReference, resolvePageDetailReference } from "./cache";
import { notifyManager, useQuery } from "@tanstack/react-query";

import { useZilobaseFeatures } from "../shared/context";
import {
  pageAccessQueryOptions,
  pageAccessTargetsQueryOptions,
  pageGuestInvitationQueryOptions,
  pageGuestInvitationsQueryOptions,
  pageGuestRequestsQueryOptions,
  pagePersonAccessTargetsQueryOptions,
  pagePropertiesQueryOptions,
  pageQueryOptions,
  pagesQueryOptions,
} from "./queries";
import type { PagesDeletedFilter } from "./contracts";

export function usePages(
  workspaceId: string | null | undefined,
  options?: { deleted?: PagesDeletedFilter; enabled?: boolean },
) {
  const navigation = usePageNavigation(workspaceId, options);
  return { ...navigation, data: navigation.data?.pages };
}

export function usePageNavigation(
  workspaceId: string | null | undefined,
  options?: { deleted?: PagesDeletedFilter; enabled?: boolean },
) {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  const query = useQuery({
    ...pagesQueryOptions(apiFetch, workspaceId, {
      deleted: options?.deleted,
    }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
  });
  const revision = useSharedDataRevision(queryClient);
  const resolved = useMemo(
    () => (query.data ? resolveNavigationReference(queryClient, query.data) : undefined),
    [queryClient, query.data, revision],
  );
  const data = resolved;
  return {
    data,
    error: query.error,
    isLoading: query.isLoading,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    isSuccess: query.isSuccess,
    status: query.status,
    refetch: query.refetch,
  };
}

type PageQueryHookOptions = {
  refetchOnMount?: boolean;
};

export function usePage(pageId: string | null | undefined, options?: PageQueryHookOptions) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const query = useQuery({
    ...pageQueryOptions(apiFetch, pageId),
    refetchOnMount: options?.refetchOnMount ?? "always",
  });
  const revision = useSharedDataRevision(queryClient);
  const data = useMemo(
    () => resolvePageDetailReference(queryClient, query.data)?.page ?? null,
    [queryClient, query.data, revision],
  );
  return {
    data,
    error: query.error,
    isLoading: query.isLoading,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    isSuccess: query.isSuccess,
    status: query.status,
    refetch: query.refetch,
  };
}

export function usePageAccessLevel(
  pageId: string | null | undefined,
  options?: PageQueryHookOptions,
) {
  const { apiFetch } = useZilobaseFeatures();

  return useQuery({
    ...pageQueryOptions(apiFetch, pageId),
    refetchOnMount: options?.refetchOnMount,
    select: (detail) => detail?.accessLevel ?? null,
  });
}

export function usePageDatabaseIds(
  pageId: string | null | undefined,
  options?: PageQueryHookOptions,
) {
  const { apiFetch } = useZilobaseFeatures();

  return useQuery({
    ...pageQueryOptions(apiFetch, pageId),
    refetchOnMount: options?.refetchOnMount,
    select: (detail) => detail?.databaseIds ?? [],
  });
}

export function usePageAccess(pageId: string | null | undefined) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const query = useQuery(pageAccessQueryOptions(apiFetch, pageId));
  useSharedDataRevision(queryClient);
  return {
    error: query.error,
    isLoading: query.isLoading,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    isSuccess: query.isSuccess,
    status: query.status,
    refetch: query.refetch,
    data: query.data && resolvePageAccessReferences(queryClient, query.data),
  };
}

export function usePageAccessTargets(workspaceId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(pageAccessTargetsQueryOptions(apiFetch, workspaceId));
}

export function usePagePersonAccessTargets(
  pageId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { apiFetch } = useZilobaseFeatures();

  return useQuery({
    ...pagePersonAccessTargetsQueryOptions(apiFetch, pageId),
    enabled: Boolean(pageId) && (options?.enabled ?? true),
  });
}

export function usePageGuestInvitations(pageId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(pageGuestInvitationsQueryOptions(apiFetch, pageId));
}

export function usePageGuestRequests(pageId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(pageGuestRequestsQueryOptions(apiFetch, pageId));
}

export function usePageGuestInvitation(invitationId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(pageGuestInvitationQueryOptions(apiFetch, invitationId));
}

type PagePropertiesOptions = {
  databaseId?: string | null;
};

function usePagePropertyReadRevision(client: QueryClient, pageId: string | null | undefined) {
  const store = useMemo(() => {
    let revision = 0;
    return {
      read: () => revision,
      subscribe: (notify: () => void) => {
        let active = true;
        const scheduleNotify = notifyManager.batchCalls(() => {
          if (active) notify();
        });
        const stop = client.getQueryCache().subscribe((event) => {
          if (event.type !== "updated" && event.type !== "removed" && event.type !== "added")
            return;
          const key = event.query.queryKey;
          if (key[0] !== "db" && !(key[0] === "page" && key[1] === pageId)) return;
          revision++;
          scheduleNotify();
        });
        return () => {
          active = false;
          stop();
        };
      },
    };
  }, [client, pageId]);
  return useSyncExternalStore(store.subscribe, store.read, store.read);
}

export function usePageProperties(
  pageId: string | null | undefined,
  options?: PagePropertiesOptions,
) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const readRevision = usePagePropertyReadRevision(queryClient, pageId);
  const query = useQuery({
    ...pagePropertiesQueryOptions(apiFetch, pageId),
    enabled: Boolean(pageId),
  });
  const revision = useSharedDataRevision(queryClient);
  const coverage = useMemo(
    () =>
      pageId ? readCachedPagePropertyCoverage(queryClient, pageId, options?.databaseId) : undefined,
    [queryClient, pageId, options?.databaseId, query.data, query.error, revision, readRevision],
  );
  const controller = useDatabaseController();
  const intentions = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const data = useMemo(
    () => projectPagePropertyIntentions(coverage?.data, pageId ?? "", intentions),
    [coverage?.data, pageId, intentions],
  );
  return {
    data,
    coverage: coverage?.state ?? "missing",
    isRefreshing: Boolean(data) && query.isFetching,
    refreshError: data ? query.error : null,
    error: query.error,
    isLoading: !data && query.isLoading,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    isSuccess: query.isSuccess,
    status: query.status,
    refetch: query.refetch,
  };
}

export function usePageWorkspaceAccess(
  pageId: string,
  activeWorkspaceId: string | null | undefined,
) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const query = useQuery({
    ...pageQueryOptions(apiFetch, pageId),
    retry: (failureCount, error) => {
      if (parseActiveWorkspaceMismatchError(error)) {
        return false;
      }

      return failureCount < 2;
    },
  });
  const mismatch = parseActiveWorkspaceMismatchError(query.error);
  const pageWorkspaceId = resolvePageDetailReference(queryClient, query.data)?.page.workspaceId;
  const hasClientMismatch = Boolean(
    pageWorkspaceId && activeWorkspaceId && pageWorkspaceId !== activeWorkspaceId,
  );
  const requiredWorkspaceId = mismatch?.workspaceId ?? (hasClientMismatch ? pageWorkspaceId : null);
  return { query, requiredWorkspaceId };
}
