import { chatCitations, chatDisplayText } from "@zilobase/features/ai";
import { AnswerSources } from "./answer-sources";
import { MessageScrollerItem, MessageScrollerContent } from "@/components/ui/message-scroller";
import { Message, MessageContent, MessageResponse } from "./message";
import { MessageActions } from "./message-actions";
import { MessageThinking } from "./message-thinking";

import type { ChatMessage } from "@zilobase/features/ai";
export type { ChatMessage } from "@zilobase/features/ai";

export function ChatbotMessages({
  isSidebar,
  messages,
  streaming = false,
  pendingLabel,
  onRetry,
}: {
  isSidebar: boolean;
  messages: ChatMessage[];
  streaming?: boolean;
  pendingLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className={`relative flex-1 ${isSidebar ? "" : "h-auto! overflow-visible! [scrollbar-gutter:auto]!"}`}
    >
      <MessageScrollerContent className="flex h-auto min-h-0 flex-col gap-8 p-4">
        {messages.map((message) => {
          const active = streaming && message.role === "assistant" && message === messages.at(-1);
          const displayText =
            message.role === "assistant" ? chatDisplayText(message.text) : message.text;
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
                  {active && !displayText ? (
                    <MessageThinking label={pendingLabel} />
                  ) : (
                    <MessageResponse isAnimating={active}>{displayText}</MessageResponse>
                  )}
                  <AnswerSources citations={citations} />
                </MessageContent>
                {message.role === "assistant" && displayText && !active && (
                  <MessageActions
                    text={displayText}
                    onRetry={message === messages.at(-1) ? onRetry : undefined}
                  />
                )}
              </Message>
            </MessageScrollerItem>
          );
        })}
      </MessageScrollerContent>
    </div>
  );
}
