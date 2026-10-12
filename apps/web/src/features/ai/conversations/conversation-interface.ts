import type { ReactNode } from "react";
import type { PromptInputMessage } from "./components/elements/prompt-input";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type ChatbotProps = {
  beforeComposer?: ReactNode;
  databaseId?: string | null;
  isSidebar?: boolean;
  pageId?: string | null;
};

export type ChatbotConversationInput = ChatbotProps;

export type { PromptInputMessage };
