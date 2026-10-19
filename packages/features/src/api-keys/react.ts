import { useMutation, useQuery } from "@tanstack/react-query";
import { createApiKey, deleteApiKey, updateApiKey } from "./operations";

import { useZilobaseFeatures } from "../shared/context";
import { useActiveWorkspaceId } from "../workspaces/react";
import { apiKeysQueryOptions } from "./queries";

export function useApiKeys(workspaceId?: string | null) {
  const { apiFetch } = useZilobaseFeatures();
  const activeWorkspaceId = useActiveWorkspaceId();

  return useQuery(apiKeysQueryOptions(apiFetch, workspaceId ?? activeWorkspaceId));
}

export function useCreateApiKey() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: { expiresIn?: number | null; name: string; workspaceId: string }) =>
      createApiKey(context, variables),
  });
}

export function useUpdateApiKey() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: {
      enabled?: boolean;
      id: string;
      name?: string;
      workspaceId: string;
    }) => updateApiKey(context, variables),
  });
}

export function useDeleteApiKey() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: { id: string; workspaceId: string }) =>
      deleteApiKey(context, variables),
  });
}
