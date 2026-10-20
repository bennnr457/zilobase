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
import { Button } from "@/components/ui/button";

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
  onContinue,
}: {
  isSidebar: boolean;
  messages: ChatMessage[];
  streaming?: boolean;
  pendingLabel?: string;
  onRetry?: () => void;
  activityByMessage?: Readonly<Record<string, readonly AgentActivity[]>>;
  activityActions?: ActivityActions;
  onContinue?: (runId: string) => void;
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
                  onContinue={message === messages.at(-1) ? onContinue : undefined}
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
  onContinue,
}: {
  message: ChatMessage;
  active: boolean;
  pendingLabel?: string;
  activities?: readonly AgentActivity[];
  activityActions?: ActivityActions;
  onRetry?: () => void;
  onContinue?: (runId: string) => void;
}) {
  activities =
    activities ??
    message.progress?.activities.map((activity) => ({
      type: "tool" as const,
      id: activity.id,
      title: activity.label,
      status: activity.status === "running" && !active ? ("stopped" as const) : activity.status,
      output:
        activity.returned === undefined
          ? undefined
          : `${activity.returned} items read${activity.hasMore ? " · more available" : ""}`,
      error: activity.error,
    }));
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
        {!!message.context?.omissions.length && !rendering && (
          <p className="text-xs text-content-secondary">{message.context.omissions.join(" ")}</p>
        )}
        {!rendering &&
          message.status === "completed" &&
          message.runId &&
          message.progress?.canContinue &&
          onContinue && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onContinue(message.runId!)}
            >
              Continue reading
            </Button>
          )}
      </MessageContent>
      {displayText && !rendering && <MessageActions text={displayText} onRetry={onRetry} />}
    </>
  );
}
