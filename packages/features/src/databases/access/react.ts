import { useMutation, useQuery } from "@tanstack/react-query";
import { useDatabaseController } from "../interactions/react";
import { resolveDatabaseAccessReferences } from "../../pages/access-references";
import { useSharedDataRevision } from "../../data/react";
import { useZilobaseFeatures } from "../../shared/context";
import { databaseAccessQueryOptions } from "../queries/queries";
type DatabaseAccessInput = {
  accessLevel: "view" | "edit" | "full";
  databaseId: string;
  targetId: string;
  targetType: "public" | "user" | "team";
};

export function useUpsertDatabaseAccess() {
  const controller = useDatabaseController();
  return useMutation({
    mutationFn: async ({ databaseId, ...body }: DatabaseAccessInput) =>
      (await controller.execute({ databaseId, command: { type: "access.upsert", ...body } }))
        .result,
  });
}

export function useDeleteDatabaseAccess() {
  const controller = useDatabaseController();
  return useMutation({
    mutationFn: async ({ databaseId, ruleId }: { databaseId: string; ruleId: string }) =>
      (await controller.execute({ databaseId, command: { type: "access.remove", ruleId } })).result,
  });
}

export function useSetDatabasePublished() {
  const controller = useDatabaseController();
  return useMutation({
    mutationFn: async ({ databaseId, isPublished }: { databaseId: string; isPublished: boolean }) =>
      (
        await controller.execute({
          databaseId,
          command: { type: "database.publish", published: isPublished },
        })
      ).result,
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
