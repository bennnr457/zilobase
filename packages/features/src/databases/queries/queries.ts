import { normalizeAccessReferences, revokeAccessReferences } from "../../pages/access-references";
import { normalizeDatabaseExportReference } from "../export-references";
import { sharedClient } from "../../data/client";
import type { DatabaseAccessPayload } from "../access/access-contracts";
import type { DatabaseExportPayload } from "../core/export-payload";
export type {
  DatabaseRecord,
  DatabaseProperty,
  PageProperty,
  DatabaseView,
  DatabaseRow,
  PagePropertyValue,
  DatabaseRowsPagination,
  DatabaseExportPayload,
  DataSourceRecord,
} from "../core/export-payload";
export type { DatabaseAccessRule, DatabaseAccessPayload } from "../access/access-contracts";
import { queryOptions } from "@tanstack/react-query";

import type { ApiFetcher } from "../../shared/api-fetcher";

export const databaseAccessQueryKey = (databaseId: string | null | undefined) =>
  ["database", databaseId ?? "none", "access"] as const;

export const databaseAccessQueryOptions = (
  apiFetch: ApiFetcher,
  databaseId: string | null | undefined,
) =>
  queryOptions({
    queryKey: databaseAccessQueryKey(databaseId),
    refetchOnWindowFocus: "always",
    enabled: Boolean(databaseId),
    queryFn: async ({ client, signal }) => {
      if (!databaseId) return { access: [] };
      const owner = sharedClient(client).database(databaseId);
      const read = await sharedClient(client).captureRead(owner?.session.id);
      const previous = client.getQueryData(databaseAccessQueryKey(databaseId));
      try {
        const result = await apiFetch<DatabaseAccessPayload>(`/databases/${databaseId}/access`, {
          method: "GET",
          signal,
        });
        return normalizeAccessReferences(client, read, "database", databaseId, result.access);
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 403
        ) {
          revokeAccessReferences(client, "database", previous, read);
          return { access: [] };
        }
        throw error;
      }
    },
  });

export const databaseContextExportQueryKey = (
  databaseId: string | null | undefined,
  dataSourceId?: string,
  rowLimit?: number,
) =>
  [
    "database-context-export",
    databaseId ?? "none",
    dataSourceId ?? "primary-source",
    ...(rowLimit === undefined ? [] : [rowLimit]),
  ] as const;

export const databaseContextExportRootQueryKey = (databaseId: string | null | undefined) =>
  ["database-context-export", databaseId ?? "none"] as const;

export const databaseContextExportQueryOptions = (
  apiFetch: ApiFetcher,
  databaseId: string,
  dataSourceId?: string,
  rowLimit?: number,
) =>
  queryOptions({
    queryKey: databaseContextExportQueryKey(databaseId, dataSourceId, rowLimit),
    queryFn: async ({ client, signal }) => {
      const read = await sharedClient(client).captureRead();
      const params = new URLSearchParams();
      if (dataSourceId) params.set("dataSourceId", dataSourceId);
      if (rowLimit !== undefined) params.set("rowLimit", String(rowLimit));
      const query = params.size ? `?${params}` : "";
      const payload = await apiFetch<DatabaseExportPayload>(
        `/databases/${encodeURIComponent(databaseId)}/export${query}`,
        { method: "GET", signal },
      );
      sharedClient(client).revalidateScope(
        read,
        client.getQueryData(databaseContextExportQueryKey(databaseId, dataSourceId, rowLimit)),
        payload.viewerType === "guest" || payload.viewerType === "public"
          ? payload.viewerType
          : "account",
      );
      return normalizeDatabaseExportReference(client, read, databaseId, payload);
    },
    staleTime: 30_000,
  });
