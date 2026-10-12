import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { useCallback } from "react";

export function useAiChatThreadState(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const workspaceId = useActiveWorkspaceId();
  const setActiveThreadId = useCallback((_threadId: string | null) => {}, []);

  return {
    activeThreadId: null as string | null,
    isBootstrapping: enabled && !workspaceId,
    setActiveThreadId,
  };
}
