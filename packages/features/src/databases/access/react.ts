import { useMutation, useQuery } from "@tanstack/react-query";
import { useSharedDataRevision } from "../../data/react";
import { resolveDatabaseAccessReferences } from "../../pages/access-references";
import { useZilobaseFeatures } from "../../shared/context";
import { databaseAccessQueryOptions } from "../queries/queries";
import { deleteDatabaseAccess, setDatabasePublished, upsertDatabaseAccess } from "./operations";

export function useUpsertDatabaseAccess() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof upsertDatabaseAccess>[1]) =>
      upsertDatabaseAccess(context, input),
  });
}

export function useDeleteDatabaseAccess() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof deleteDatabaseAccess>[1]) =>
      deleteDatabaseAccess(context, input),
  });
}

export function useSetDatabasePublished() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof setDatabasePublished>[1]) =>
      setDatabasePublished(context, input),
  });
}

export function useDatabaseAccess(databaseId: string | null | undefined) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const query = useQuery(databaseAccessQueryOptions(apiFetch, databaseId));
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
    data: query.data && resolveDatabaseAccessReferences(queryClient, query.data),
  };
}
