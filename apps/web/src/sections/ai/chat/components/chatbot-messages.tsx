import { chatCitations, chatDisplayText } from "@zilobase/features/ai";
import { AnswerSources } from "./answer-sources";
import { MessageScrollerItem, MessageScrollerContent } from "@/components/ui/message-scroller";
import { Message, MessageContent, MessageResponse } from "./message";
import { MessageActions } from "./message-actions";
import { MessageThinking } from "./message-thinking";
import { SelectedSources } from "./selected-sources";
import { lazy, Suspense } from "react";
import type { ActivityActions, AgentActivity } from "../lib/agent-activity";
import { useSmoothText } from "../hooks/use-smooth-text";

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
        {messages.map((message) => (
          <MessageScrollerItem
            key={message.id}
            messageId={message.id}
            className="[content-visibility:visible]"
          >
            <Message from={message.role}>
              {message.role === "assistant" ? (
                <AssistantMessage
                  message={message}
                  active={streaming && message === messages.at(-1)}
                  pendingLabel={pendingLabel}
                  activities={activityByMessage?.[message.id]}
                  activityActions={activityActions}
                  onRetry={message === messages.at(-1) ? onRetry : undefined}
                />
              ) : (
                <MessageContent>
                  <MessageResponse>{message.text}</MessageResponse>
                </MessageContent>
              )}
            </Message>
          </MessageScrollerItem>
        ))}
      </MessageScrollerContent>
    </div>
  );
}

function AssistantMessage({
  message,
  active,
  pendingLabel,
  activities,
  activityActions,
  onRetry,
}: {
  message: ChatMessage;
  active: boolean;
  pendingLabel?: string;
  activities?: readonly AgentActivity[];
  activityActions?: ActivityActions;
  onRetry?: () => void;
}) {
  const displayText = chatDisplayText(message.text);
  const { text, isSmoothing } = useSmoothText(
    displayText,
    active,
    !active && message.status !== "completed",
  );
  const rendering = active || isSmoothing;
  const hasActiveActivity = activities?.some(
    (activity) => activity.status === "running" || activity.status === "pending",
  );
  const citations = message.context
    ? chatCitations(message.text, message.context.manifest).filter(
        (entry) => entry.pageId || entry.databaseId,
      )
    : [];
  return (
    <>
      <MessageContent data-ai-streaming={rendering || undefined}>
        <SelectedSources message={message} />
        {!!activities?.length && (
          <Suspense fallback={<MessageThinking label="Loading activity" />}>
            <LazyMessageActivity activities={activities} actions={activityActions} />
          </Suspense>
        )}
        {rendering && !text ? (
          !hasActiveActivity && <MessageThinking label={pendingLabel} />
        ) : (
          <MessageResponse isAnimating={rendering}>{text}</MessageResponse>
        )}
        {text && citations.length > 0 && <AnswerSources citations={citations} />}
      </MessageContent>
      {displayText && !rendering && <MessageActions text={displayText} onRetry={onRetry} />}
    </>
  );
}
