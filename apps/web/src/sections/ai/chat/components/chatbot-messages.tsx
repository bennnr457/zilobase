"use client";

import { MessageList, MessageListContent } from "./message-list";
import { Message, MessageContent, MessageResponse } from "./message";

import type { ChatMessage } from "@zilobase/features/ai";
export type { ChatMessage } from "@zilobase/features/ai";
import { ContextInspector } from "../../attachments/components/context-inspector";

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
              {message.status && message.status !== "completed" && (
                <p className="mt-2 text-xs text-content-secondary">{message.status}</p>
              )}
              {message.context && (
                <ContextInspector context={message.context} label="Sources for this answer" />
              )}
            </MessageContent>
          </Message>
        ))}
      </MessageListContent>
    </MessageList>
  );
}
