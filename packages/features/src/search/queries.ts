import { normalizeSearchReferences } from "./references";
import { sharedClient } from "../data/client";
import type { AppSearchResult, AppSearchResultType, SearchMode, SearchMetadata } from "./contracts";
import { queryOptions } from "@tanstack/react-query";

import type { ApiFetcher } from "../shared/api-fetcher";

export const appSearchQueryKey = (
  workspaceId: string | null | undefined,
  query: string,
  types?: AppSearchResultType[],
  mode: SearchMode = "keyword",
) => ["search", workspaceId ?? "none", query, types?.join(",") ?? "all", mode] as const;

export const appSearchQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  query: string,
  enabled = true,
  types?: AppSearchResultType[],
  mode: SearchMode = "keyword",
) =>
  queryOptions({
    queryKey: appSearchQueryKey(workspaceId, query, types, mode),
    enabled: Boolean(workspaceId) && enabled,
    staleTime: 15_000,
    queryFn: async ({ client, signal }) => {
      if (!workspaceId) {
        return { results: [], metadata: undefined as SearchMetadata | undefined };
      }

      const read = await sharedClient(client).captureRead();
      const params = new URLSearchParams({
        workspaceId,
        q: query,
        mode,
      });
      if (types?.length) params.set("types", types.join(","));

      try {
        const result = await apiFetch<{
          results: Array<AppSearchResult & { entity: unknown; excerpt?: string | null }>;
          metadata?: SearchMetadata;
        }>(`/search?${params.toString()}`, { method: "GET", signal });

        return {
          results: normalizeSearchReferences(client, read, workspaceId, result.results),
          metadata: result.metadata,
        };
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 401
        ) {
          return { results: [], metadata: undefined as SearchMetadata | undefined };
        }

        throw error;
      }
    },
  });
