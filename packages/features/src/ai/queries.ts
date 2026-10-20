import { queryOptions } from "@tanstack/react-query";
import { captureClientOperation, type ClientOperationContext } from "../shared/operation-context";
import type { ChatThread, ChatThreadDetail } from "./contracts";

export const chatThreadsKey = (workspaceId: string) => ["ai", workspaceId, "threads"] as const;
export const chatThreadKey = (workspaceId: string, id: string) =>
  ["ai", workspaceId, "thread", id] as const;
export const chatThreadsOptions = (
  { apiFetch, queryClient }: ClientOperationContext,
  workspaceId: string,
) =>
  queryOptions({
    queryKey: chatThreadsKey(workspaceId),
    enabled: !!workspaceId,
    queryFn: ({ signal }) =>
      captureClientOperation({ apiFetch, queryClient }).context.apiFetch<ChatThread[]>(
        `/ai/threads?workspaceId=${encodeURIComponent(workspaceId)}`,
        { signal },
      ),
  });
export const chatThreadOptions = (
  { apiFetch, queryClient }: ClientOperationContext,
  workspaceId: string,
  id: string,
) =>
  queryOptions({
    queryKey: chatThreadKey(workspaceId, id),
    enabled: !!workspaceId && !!id,
    queryFn: ({ signal }) =>
      captureClientOperation({ apiFetch, queryClient }).context.apiFetch<ChatThreadDetail>(
        `/ai/threads/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(workspaceId)}`,
        { signal },
      ),
  });
export async function deleteChatConversation(
  context: ClientOperationContext,
  workspaceId: string,
  id: string,
) {
  const scope = captureClientOperation(context);
  await scope.context.apiFetch(
    `/ai/threads/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(workspaceId)}`,
    { method: "DELETE" },
  );
  scope.assertCurrent();
  context.queryClient.removeQueries({ queryKey: chatThreadKey(workspaceId, id) });
  await context.queryClient.invalidateQueries({ queryKey: chatThreadsKey(workspaceId) });
}

export const chatSelectionOptions = (workspaceId: string, sessionId?: string) =>
  queryOptions({
    queryKey: ["ai", workspaceId, "selection", sessionId] as const,
    queryFn: async () => ({ id: null as string | null, initialized: false, revision: 0 }),
    staleTime: Infinity,
    initialData: { id: null as string | null, initialized: false, revision: 0 },
  });
