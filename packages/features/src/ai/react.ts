import { useCallback } from "react";
import { useZilobaseFeatures } from "../shared/context";
import { prepareChatContext } from "./operations";
import type { ResourceRef } from "@zilobase/page-context";
import { useDatabaseMetadata } from "../databases/queries/metadata";
import { getDatabaseEmoji } from "../databases/views/appearance";
import { usePage } from "../pages/query-hooks";
import { readMetadataRecord } from "../pages/item-relationships";

/** Draft attachments resolve current authorized metadata, never historical chat labels. */
export function useChatAttachmentMetadata(workspaceId: string | null, ref: ResourceRef) {
  const database = useDatabaseMetadata(workspaceId && ref.type === "database" ? ref.id : null);
  const page = usePage(workspaceId && ref.type === "page" ? ref.id : null);
  if (ref.type === "database") {
    const data = database.data;
    if (!database.isError && data?.database.workspaceId === workspaceId && !data.database.deletedAt)
      return {
        title: data.displayName,
        emoji: getDatabaseEmoji(data.activeDataSource ?? data.database),
      };
  } else if (!page.isError && page.data?.workspaceId === workspaceId && !page.data.deletedAt) {
    return { title: page.data.name, emoji: readMetadataRecord(page.data.metadata).emoji };
  }
  const unavailable = ref.type === "database" ? database.isError : page.isError;
  return {
    title: unavailable ? `Unavailable ${ref.type}` : `Loading ${ref.type}…`,
    emoji: null,
  };
}

export function usePrepareChatContext() {
  const context = useZilobaseFeatures();
  return useCallback(
    (input: Parameters<typeof prepareChatContext>[1]) => prepareChatContext(context, input),
    [context],
  );
}

import { sendChat } from "./stream";
export function useSendChat() {
  const context = useZilobaseFeatures();
  return useCallback(
    (...args: Parameters<typeof sendChat> extends [unknown, ...infer Rest] ? Rest : never) =>
      sendChat(context, ...args),
    [context],
  );
}

import { useQuery, useMutation } from "@tanstack/react-query";
import { useSession } from "../auth/react";
import {
  chatThreadsOptions,
  chatSelectionOptions,
  chatThreadOptions,
  chatThreadsKey,
  chatThreadKey,
  deleteChatConversation,
} from "./queries";
export function useChatThreads(workspaceId: string, threadId: string | null, enabled: boolean) {
  const context = useZilobaseFeatures();
  const list = useQuery({
    ...chatThreadsOptions(context, workspaceId),
    refetchInterval: (query) =>
      query.state.data?.some((thread) => ["queued", "running"].includes(thread.status ?? ""))
        ? 2000
        : 15_000,
  });
  const detail = useQuery({
    ...chatThreadOptions(context, workspaceId, threadId ?? ""),
    enabled: enabled && !!threadId,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteChatConversation(context, workspaceId, id),
  });
  const refresh = () =>
    Promise.all([
      context.queryClient.invalidateQueries({ queryKey: chatThreadsKey(workspaceId) }),
      threadId
        ? context.queryClient.invalidateQueries({ queryKey: chatThreadKey(workspaceId, threadId) })
        : Promise.resolve(),
    ]);
  return { list, detail, remove, refresh };
}

export function useChatSelection(workspaceId: string) {
  const { queryClient } = useZilobaseFeatures();
  const { data: session } = useSession();
  const options = chatSelectionOptions(workspaceId, session?.session?.id);
  const query = useQuery(options);
  return {
    ...query.data,
    isCurrent: (revision: number) =>
      queryClient.getQueryData(options.queryKey)?.revision === revision,
    select: (id: string | null) =>
      queryClient.setQueryData(options.queryKey, (current) => ({
        id,
        initialized: true,
        revision: (current?.revision ?? 0) + 1,
      }))!,
  };
}

import { followChatRun, cancelChatRun, recoverChatSubmission } from "./durable";
export function useFollowChatRun() {
  const context = useZilobaseFeatures();
  return useCallback(
    (...args: Parameters<typeof followChatRun> extends [unknown, ...infer Rest] ? Rest : never) =>
      followChatRun(context, ...args),
    [context],
  );
}
export function useCancelChatRun() {
  const context = useZilobaseFeatures();
  return useCallback(
    (runId: string, workspaceId: string) => cancelChatRun(context, runId, workspaceId),
    [context],
  );
}
export function useRecoverChatSubmission() {
  const context = useZilobaseFeatures();
  return useCallback(
    (workspaceId: string) => recoverChatSubmission(context, workspaceId),
    [context],
  );
}
