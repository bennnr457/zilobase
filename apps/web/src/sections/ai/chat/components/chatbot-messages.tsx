import { chatCitations, chatDisplayText } from "@zilobase/features/ai";
import { AnswerSources } from "./answer-sources";
import { MessageScrollerItem, MessageScrollerContent } from "@/components/ui/message-scroller";
import { Message, MessageContent, MessageResponse } from "./message";
import { MessageActions } from "./message-actions";
import { MessageThinking } from "./message-thinking";
import { SelectedSources } from "./selected-sources";
import { lazy, Suspense } from "react";
import type { ActivityActions, AgentActivity } from "../lib/agent-activity";

const LazyMessageActivity = lazy(() => import("./message-activity"));

import type { ChatMessage } from "@zilobase/features/ai";
export type { ChatMessage } from "@zilobase/features/ai";

export function ChatbotMessages({
  isSidebar,
  messages,
  streaming = false,
  pendingLabel,
  onRetry,
  activityByMessage,
  activityActions,
}: {
  isSidebar: boolean;
  messages: ChatMessage[];
  streaming?: boolean;
  pendingLabel?: string;
  onRetry?: () => void;
  activityByMessage?: Readonly<Record<string, readonly AgentActivity[]>>;
  activityActions?: ActivityActions;
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
          const activities =
            message.role === "assistant" ? activityByMessage?.[message.id] : undefined;
          const hasActiveActivity = activities?.some(
            (activity) => activity.status === "running" || activity.status === "pending",
          );
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
                  <SelectedSources message={message} />
                  {!!activities?.length && (
                    <Suspense fallback={<MessageThinking label="Loading activity" />}>
                      <LazyMessageActivity activities={activities} actions={activityActions} />
                    </Suspense>
                  )}
                  {active && !displayText ? (
                    !hasActiveActivity && <MessageThinking label={pendingLabel} />
                  ) : (
                    <MessageResponse isAnimating={active}>{displayText}</MessageResponse>
                  )}
                  {citations.length > 0 && <AnswerSources citations={citations} />}
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
