import { type ClientOperationContext } from "../shared/operation-context";
import { runClientMutation } from "../shared/operation-mutation";

import type { ApiKeyRecord, CreatedApiKeyRecord } from "./contracts";
import { apiKeysQueryKey } from "./queries";

export type CreateApiKeyOperationInput = {
  expiresIn?: number | null;
  name: string;
  workspaceId: string;
};
export type CreateApiKeyOperationResult = { key: CreatedApiKeyRecord };
export function createApiKey(
  context: ClientOperationContext,
  input: CreateApiKeyOperationInput,
): Promise<CreateApiKeyOperationResult> {
  return runClientMutation(context, input, ({ apiFetch, queryClient }) => ({
    mutationFn: (input: CreateApiKeyOperationInput) =>
      apiFetch<{ key: CreatedApiKeyRecord }>("/api/keys", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysQueryKey(variables.workspaceId),
      });
    },
  }));
}

export type UpdateApiKeyOperationInput = {
  enabled?: boolean;
  id: string;
  name?: string;
  workspaceId: string;
};
export type UpdateApiKeyOperationResult = { key: ApiKeyRecord };
export function updateApiKey(
  context: ClientOperationContext,
  input: UpdateApiKeyOperationInput,
): Promise<UpdateApiKeyOperationResult> {
  return runClientMutation(context, input, ({ apiFetch, queryClient }) => ({
    mutationFn: ({ id, ...input }: UpdateApiKeyOperationInput) =>
      apiFetch<{ key: ApiKeyRecord }>(`/api/keys/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysQueryKey(variables.workspaceId),
      });
    },
  }));
}

export type DeleteApiKeyOperationInput = { id: string; workspaceId: string };
export type DeleteApiKeyOperationResult = { deleted: boolean };
export function deleteApiKey(
  context: ClientOperationContext,
  input: DeleteApiKeyOperationInput,
): Promise<DeleteApiKeyOperationResult> {
  return runClientMutation(context, input, ({ apiFetch, queryClient }) => ({
    mutationFn: ({ id }: DeleteApiKeyOperationInput) =>
      apiFetch<{ deleted: boolean }>(`/api/keys/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysQueryKey(variables.workspaceId),
      });
    },
  }));
}
