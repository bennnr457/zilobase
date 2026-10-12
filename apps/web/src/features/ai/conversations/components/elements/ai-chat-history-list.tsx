"use client";

import { cn } from "@/shared/lib/utils";

export function AiChatHistoryList({
  className,
}: {
  activeThreadId?: string | null;
  canPin?: boolean;
  className?: string;
  limit?: number;
  onSelectThread?: (threadId: string | null) => void;
}) {
  return <p className={cn("px-2 py-1 text-xs text-content-secondary", className)}>No chats yet</p>;
}
