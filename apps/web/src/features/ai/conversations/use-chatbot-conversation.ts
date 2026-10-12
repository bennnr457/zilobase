import { useSession } from "@zilobase/features/auth/react";
import { useCallback, useRef, useState, type ChangeEvent } from "react";

import type { ChatbotConversationInput, ChatMessage } from "./conversation-interface";
import type { PromptInputMessage } from "./components/elements/prompt-input";

export function useChatbotConversation({ isSidebar = false }: ChatbotConversationInput) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const onSubmit = useCallback(async (message: PromptInputMessage) => {
    const nextText = message.text.trim();
    if (!nextText) return;
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: nextText },
    ]);
    setText("");
  }, []);

  const onTextChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
  }, []);

  return {
    composerProps: {
      isSidebar,
      onSubmit,
      onTextChange,
      rootRef,
      text,
    },
    hasMessages: messages.length > 0,
    messagesProps: {
      isSidebar,
      messages,
    },
    rootRef,
    session,
    setText,
  };
}
