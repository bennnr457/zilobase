"use client";

import type { ChatMessage } from "../../conversation-interface";
import { Conversation, ConversationContent } from "./conversation";
import { Message, MessageContent, MessageResponse } from "./message";

export function ChatbotMessages({
  isSidebar,
  messages,
}: {
  isSidebar: boolean;
  messages: ChatMessage[];
}) {
  return (
    <Conversation
      className={isSidebar ? undefined : "h-auto! overflow-visible! [scrollbar-gutter:auto]!"}
    >
      <ConversationContent>
        {messages.map((message) => (
          <Message from={message.role} key={message.id}>
            <MessageContent>
              <MessageResponse>{message.text}</MessageResponse>
            </MessageContent>
          </Message>
        ))}
      </ConversationContent>
    </Conversation>
  );
}
