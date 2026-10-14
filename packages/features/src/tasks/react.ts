import { useQueries } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import { useSharedDataRevision } from "../data/react";
import { databaseContextExportQueryOptions } from "../databases/queries/queries";
import { resolveDatabaseExportReference } from "../databases/export-references";
import type { DatabaseExportPayload } from "../databases/core/export-payload";

export function useTaskDatabases(databaseIds: string[]) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  useSharedDataRevision(queryClient);
  const queries = useQueries({
    queries: databaseIds.map((id) => databaseContextExportQueryOptions(apiFetch, id)),
  });
  const payloads = queries
    .map((query) => resolveDatabaseExportReference(queryClient, query.data))
    .filter((payload): payload is DatabaseExportPayload => Boolean(payload));
  return { queries, payloads, isLoading: queries.some((query) => query.isLoading) };
}
