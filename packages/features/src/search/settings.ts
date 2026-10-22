import { sharedClient } from "../data/client";
import { queryOptions } from "@tanstack/react-query";
import type { ApiFetcher } from "../shared/api-fetcher";
import type { WorkspaceSearchSettings } from "./contracts";

export const workspaceSearchSettingsQueryKey = (workspaceId: string | null | undefined) =>
  ["search-settings", workspaceId ?? "none"] as const;
export function workspaceSearchSettingsQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) {
  return queryOptions({
    queryKey: workspaceSearchSettingsQueryKey(workspaceId),
    enabled: !!workspaceId,
    queryFn: async ({ client, signal }) => {
      if (!workspaceId) throw new Error("Workspace is required");
      const read = await sharedClient(client).captureRead();
      const result = await apiFetch<WorkspaceSearchSettings>(
        `/workspaces/${encodeURIComponent(workspaceId)}/search/settings`,
        { method: "GET", signal },
      );
      sharedClient(client).resolve(read, workspaceId);
      if (result.workspaceId !== workspaceId) throw new Error("Search settings scope mismatch");
      return result;
    },
    refetchInterval: (query) => {
      const settings = query.state.data;
      return settings?.enabled &&
        (!settings.backfillComplete || settings.progress.pending + settings.progress.running > 0)
        ? 5000
        : false;
    },
  });
}
export function updateWorkspaceSearchSettings(
  apiFetch: ApiFetcher,
  workspaceId: string,
  enabled: boolean,
) {
  return apiFetch<WorkspaceSearchSettings>(
    `/workspaces/${encodeURIComponent(workspaceId)}/search/settings`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    },
  );
}
export function reindexWorkspaceSearch(apiFetch: ApiFetcher, workspaceId: string) {
  return apiFetch<WorkspaceSearchSettings>(
    `/workspaces/${encodeURIComponent(workspaceId)}/search/reindex`,
    { method: "POST" },
  );
}
