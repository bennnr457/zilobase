import { chatCitations, chatDisplayText } from "@zilobase/features/ai";
import { AnswerSources } from "./answer-sources";
import { MessageScrollerItem, MessageScrollerContent } from "@/components/ui/message-scroller";
import { Message, MessageContent, MessageResponse } from "./message";

import type { ChatMessage } from "@zilobase/features/ai";
export type { ChatMessage } from "@zilobase/features/ai";

export function ChatbotMessages({
  isSidebar,
  messages,
}: {
  isSidebar: boolean;
  messages: ChatMessage[];
}) {
  return (
    <div
      className={`relative flex-1 ${isSidebar ? "" : "h-auto! overflow-visible! [scrollbar-gutter:auto]!"}`}
    >
      <MessageScrollerContent className="flex h-auto min-h-0 flex-col gap-8 p-4">
        {messages.map((message) => {
          const citations =
            message.role === "assistant" && message.context
              ? chatCitations(message.text, message.context.manifest).filter(
                  (entry) => entry.pageId || entry.databaseId,
                )
              : [];
          return (
            <MessageScrollerItem
              key={message.id}
              messageId={message.id}
              className="[content-visibility:visible]"
            >
              <Message from={message.role}>
                <MessageContent>
                  <MessageResponse>
                    {message.role === "assistant" ? chatDisplayText(message.text) : message.text}
                  </MessageResponse>
                  <AnswerSources citations={citations} />
                </MessageContent>
              </Message>
            </MessageScrollerItem>
          );
        })}
      </MessageScrollerContent>
    </div>
  );
}
