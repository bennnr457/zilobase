import { useCallback } from "react";
import { useZilobaseFeatures } from "../shared/context";
import { prepareChatContext } from "./operations";

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
  const list = useQuery(chatThreadsOptions(context, workspaceId));
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
    select: (id: string | null) =>
      queryClient.setQueryData(options.queryKey, { id, initialized: true }),
  };
}
