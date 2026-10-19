import { useChatAttachments } from "../../attachments/hooks/use-chat-attachments";
import { ContextInspector } from "../../attachments/components/context-inspector";
import type { BuildContextResult } from "@zilobase/page-context";
import { ChatLayout } from "./chat-layout";
import { Button } from "@/components/ui/button";
import { ChatbotComposer } from "../../composer/components/chatbot-composer";
import { ChatbotMessages, type ChatMessage } from "./chatbot-messages";
import { useSession } from "@zilobase/features/auth/react";
import { useRef, useState, type ReactNode } from "react";
import type { PromptInputMessage } from "../../composer/components/prompt-input";

export default function Chatbot({
  isSidebar = false,
  beforeComposer,
  workspaceId,
  pageId,
  databaseId,
}: {
  isSidebar?: boolean;
  beforeComposer?: ReactNode;
  workspaceId: string | null;
  pageId?: string | null;
  databaseId?: string | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const attachmentState = useChatAttachments(workspaceId);
  const [sentContext, setSentContext] = useState<BuildContextResult | null>(null);
  const onSubmit = async (message: PromptInputMessage) => {
    const nextText = message.text.trim();
    if (!nextText || attachmentState.busy) return;
    try {
      const prepared = await attachmentState.build();
      setSentContext(prepared.result);
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", text: nextText },
      ]);
      setText("");
    } catch {
      /* The attachment panel retains the draft and displays the failure. */
    }
  };
  const hasMessages = messages.length > 0;
  const centerEmptyState = !isSidebar && !hasMessages;
  return (
    <div
      className={`relative flex h-full min-h-0 flex-col ${centerEmptyState ? "ask-ai-empty" : ""}`}
    >
      <div
        ref={rootRef}
        data-ai-scroll-shell
        className={centerEmptyState ? "shrink-0" : "min-h-0 flex-1 overflow-y-auto"}
      >
        <ChatLayout sidebar={isSidebar}>
          {!hasMessages && (
            <div className="mx-auto mb-6 grid w-full max-w-3xl justify-items-center gap-3 px-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-surface-secondary text-lg font-semibold">
                AI
              </div>
              <div>
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  {getGreeting(session?.user?.name)}
                </h1>
                <p className="mt-1 text-sm text-content-secondary">
                  Search, create, and work across your Zilobase workspace.
                </p>
              </div>
              <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                {starterPrompts.map((prompt) => (
                  <Button
                    key={prompt}
                    onClick={() => setText(prompt)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {hasMessages && <ChatbotMessages isSidebar={isSidebar} messages={messages} />}
        </ChatLayout>
      </div>
      <ChatLayout sidebar={isSidebar}>
        {beforeComposer}
        {sentContext && (
          <ContextInspector context={sentContext} label="Last prepared message context" />
        )}

        <ChatbotComposer
          isSidebar={isSidebar}
          onSubmit={onSubmit}
          onTextChange={setText}
          workspaceId={workspaceId}
          onAttach={attachmentState.add}
          disabled={attachmentState.busy}
          rootRef={rootRef}
          text={text}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {attachmentState.attachments.map((item) => (
              <Button
                key={`${item.type}:${item.id}`}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => attachmentState.remove(item)}
                aria-label={`Remove ${item.title}`}
              >
                {item.title} ×
              </Button>
            ))}
            {(pageId || databaseId) && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  attachmentState.add({
                    id: databaseId || pageId!,
                    type: databaseId ? "database" : "page",
                    title: databaseId ? "Current database" : "Current page",
                    path: "",
                    emoji: null,
                  })
                }
              >
                Attach current {databaseId ? "database" : "page"}
              </Button>
            )}
            {!!attachmentState.attachments.length && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={attachmentState.busy}
                onClick={() => {
                  void attachmentState.build().catch(() => {});
                }}
              >
                Refresh context preview
              </Button>
            )}
          </div>
          {attachmentState.busy && (
            <p role="status" className="mb-2 text-xs">
              Preparing context…
            </p>
          )}
          {attachmentState.error && (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {attachmentState.error}. Retry or remove an attachment.
            </p>
          )}
          {attachmentState.preview && (
            <ContextInspector context={attachmentState.preview} label="Draft context preview" />
          )}
        </ChatbotComposer>
      </ChatLayout>
    </div>
  );
}

function getGreeting(name?: string | null) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = name?.trim().split(/\s+/)[0];
  return firstName ? `${greeting}, ${firstName}` : greeting;
}

const starterPrompts = [
  "Summarize my workspace",
  "Find relevant information",
  "Create a project plan",
];
