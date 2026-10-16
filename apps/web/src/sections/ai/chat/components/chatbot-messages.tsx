"use client";

import { MessageList, MessageListContent } from "./message-list";
import { Message, MessageContent, MessageResponse } from "./message";

export type ChatMessage = { id: string; role: "user" | "assistant"; text: string };

export function ChatbotMessages({
  isSidebar,
  messages,
}: {
  isSidebar: boolean;
  messages: ChatMessage[];
}) {
  return (
    <MessageList
      className={isSidebar ? undefined : "h-auto! overflow-visible! [scrollbar-gutter:auto]!"}
    >
      <MessageListContent>
        {messages.map((message) => (
          <Message from={message.role} key={message.id}>
            <MessageContent>
              <MessageResponse>{message.text}</MessageResponse>
            </MessageContent>
          </Message>
        ))}
      </MessageListContent>
    </MessageList>
  );
}
