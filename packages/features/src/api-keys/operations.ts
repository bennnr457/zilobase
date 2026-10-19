import { type ClientOperationContext } from "../shared/operation-context";
import { clientMutation, runClientMutation } from "../shared/operation-mutation";

import type { ApiKeyRecord, CreatedApiKeyRecord } from "./contracts";
import { apiKeysQueryKey } from "./queries";

function defineCreateApiKeyMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: (input: { expiresIn?: number | null; name: string; workspaceId: string }) =>
      apiFetch<{ key: CreatedApiKeyRecord }>("/api/keys", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysQueryKey(variables.workspaceId),
      });
    },
  });
}
export type CreateApiKeyOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineCreateApiKeyMutation>["mutationFn"]>
>[0];
export type CreateApiKeyOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineCreateApiKeyMutation>["mutationFn"]>>
>;
export function createApiKey(
  context: ClientOperationContext,
  input: CreateApiKeyOperationInput,
): Promise<CreateApiKeyOperationResult> {
  return runClientMutation(context, input, (context) => defineCreateApiKeyMutation(context));
}

function defineUpdateApiKeyMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      enabled?: boolean;
      id: string;
      name?: string;
      workspaceId: string;
    }) =>
      apiFetch<{ key: ApiKeyRecord }>(`/api/keys/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysQueryKey(variables.workspaceId),
      });
    },
  });
}
export type UpdateApiKeyOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineUpdateApiKeyMutation>["mutationFn"]>
>[0];
export type UpdateApiKeyOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdateApiKeyMutation>["mutationFn"]>>
>;
export function updateApiKey(
  context: ClientOperationContext,
  input: UpdateApiKeyOperationInput,
): Promise<UpdateApiKeyOperationResult> {
  return runClientMutation(context, input, (context) => defineUpdateApiKeyMutation(context));
}

function defineDeleteApiKeyMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: ({ id }: { id: string; workspaceId: string }) =>
      apiFetch<{ deleted: boolean }>(`/api/keys/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysQueryKey(variables.workspaceId),
      });
    },
  });
}
export type DeleteApiKeyOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineDeleteApiKeyMutation>["mutationFn"]>
>[0];
export type DeleteApiKeyOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineDeleteApiKeyMutation>["mutationFn"]>>
>;
export function deleteApiKey(
  context: ClientOperationContext,
  input: DeleteApiKeyOperationInput,
): Promise<DeleteApiKeyOperationResult> {
  return runClientMutation(context, input, (context) => defineDeleteApiKeyMutation(context));
}
