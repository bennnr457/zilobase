import type { ChatRequest } from "@zilobase/features/ai";
import { useSendChat, useChatThreads, useChatSelection } from "@zilobase/features/ai/react";
import { useChatAttachments } from "../../attachments/hooks/use-chat-attachments";
import { ContextInspector } from "../../attachments/components/context-inspector";
import type { BuildContextResult } from "@zilobase/page-context";
import { ChatLayout } from "./chat-layout";
import { Button } from "@/components/ui/button";
import { ChatbotComposer } from "../../composer/components/chatbot-composer";
import { ChatbotMessages, type ChatMessage } from "./chatbot-messages";
import { useSession } from "@zilobase/features/auth/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const send = useSendChat();
  const [streaming, setStreaming] = useState(false);
  const selection = useChatSelection(workspaceId ?? "");
  const threads = useChatThreads(
    workspaceId ?? "",
    selection.id,
    !streaming && !attachmentState.busy,
  );
  const loadedThread = useRef<string | null>(null);
  useEffect(() => {
    if (!selection.initialized && threads.list.isSuccess)
      selection.select(threads.list.data[0]?.id ?? null);
  }, [selection, threads.list.isSuccess, threads.list.data]);
  useEffect(() => {
    if (streaming || !threads.detail.data || loadedThread.current === selection.id) return;
    const detail = threads.detail.data;
    loadedThread.current = selection.id;
    setMessages(detail.messages);
    attachmentState.setAttachments(
      detail.roots.map((ref) => ({
        ...ref,
        title:
          detail.messages
            .flatMap((message) => message.context?.manifest ?? [])
            .find((entry) => entry.id === ref.id && entry.type === ref.type)?.title ?? ref.type,
        path: "",
        emoji: null,
      })),
    );
  }, [threads.detail.data, selection.id, streaming, attachmentState]);
  const [chatError, setChatError] = useState<string | null>(null);
  const pendingRequest = useRef<ChatRequest | null>(null);
  const streamController = useRef<AbortController | null>(null);
  useEffect(() => () => streamController.current?.abort(), []);
  const onSubmit = async (message: PromptInputMessage) => {
    const nextText = message.text.trim();
    if (!nextText || attachmentState.busy || streaming || !workspaceId) return;
    setChatError(null);
    const controller = new AbortController();
    streamController.current = controller;
    const assistantId = crypto.randomUUID();
    let accepted = false;
    try {
      const prepared = await attachmentState.build();
      controller.signal.throwIfAborted();
      setStreaming(true);
      const nextRequest: ChatRequest = {
        workspaceId,
        requestId: crypto.randomUUID(),
        threadId: selection.id ?? undefined,
        text: nextText,
        roots: prepared.roots,
        snapshots: prepared.snapshots,
        history: [],
      };
      const signature = (request: ChatRequest) =>
        JSON.stringify({
          workspaceId: request.workspaceId,
          text: request.text,
          roots: request.roots,
          snapshots: request.snapshots.map(({ pageId, content }) => ({ pageId, content })),
        });
      if (pendingRequest.current && signature(pendingRequest.current) === signature(nextRequest))
        nextRequest.requestId = pendingRequest.current.requestId;
      pendingRequest.current = nextRequest;
      await send(nextRequest, controller.signal, (event) => {
        if (event.type === "context") {
          if (event.threadId) {
            loadedThread.current = event.threadId;
            selection.select(event.threadId);
          }
          accepted = true;
          pendingRequest.current = null;
          setSentContext(event.context);
          setText("");
          setMessages((current) => [
            ...current,
            { id: crypto.randomUUID(), role: "user", text: nextText, roots: prepared.roots },
            {
              id: assistantId,
              role: "assistant",
              text: "",
              roots: prepared.roots,
              context: event.context,
              status: "streaming",
            },
          ]);
        } else if (event.type === "delta")
          setMessages((current) =>
            current.map((entry) =>
              entry.id === assistantId ? { ...entry, text: entry.text + event.text } : entry,
            ),
          );
        else if (event.type === "done")
          setMessages((current) =>
            current.map((entry) =>
              entry.id === assistantId ? { ...entry, status: event.status } : entry,
            ),
          );
      });
    } catch (cause) {
      if (!controller.signal.aborted)
        setChatError(cause instanceof Error ? cause.message : "Could not send message");
      if (accepted)
        setMessages((current) =>
          current.map((entry) =>
            entry.id === assistantId
              ? { ...entry, status: controller.signal.aborted ? "stopped" : "failed" }
              : entry,
          ),
        );
      if (!controller.signal.aborted) setText(nextText);
    } finally {
      if (streamController.current === controller) {
        streamController.current = null;
        setStreaming(false);
        if (!controller.signal.aborted) void threads.refresh();
      }
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
                  Attach pages and databases to ask questions about your workspace.
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
        <div className="mb-2 flex items-center gap-2">
          <select
            aria-label="Conversation"
            value={selection.id ?? ""}
            disabled={streaming || attachmentState.busy}
            className="min-w-0 flex-1 rounded border bg-surface-canvas p-2 text-sm"
            onChange={(event) => {
              loadedThread.current = null;
              setMessages([]);
              setSentContext(null);
              setText("");
              attachmentState.setAttachments([]);
              selection.select(event.target.value || null);
            }}
          >
            <option value="">New chat</option>
            {(threads.list.data ?? []).map((thread) => (
              <option key={thread.id} value={thread.id}>
                {thread.title}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={streaming}
            onClick={() => {
              loadedThread.current = null;
              selection.select(null);
              setMessages([]);
              setSentContext(null);
              setText("");
            }}
          >
            New chat
          </Button>
          {selection.id && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={streaming || threads.remove.isPending}
              onClick={() => {
                const id = selection.id!;
                threads.remove.mutate(id, {
                  onSuccess: () => {
                    selection.select(null);
                    setMessages([]);
                    setSentContext(null);
                  },
                  onError: (error) => setChatError(error.message),
                });
              }}
            >
              Delete chat
            </Button>
          )}
        </div>
        {threads.detail.isError && (
          <p role="alert" className="mb-2 text-sm text-destructive">
            {threads.detail.error.message}
          </p>
        )}

        <ChatbotComposer
          isSidebar={isSidebar}
          onSubmit={onSubmit}
          onTextChange={setText}
          workspaceId={workspaceId}
          onAttach={attachmentState.add}
          disabled={attachmentState.busy || streaming}
          rootRef={rootRef}
          onStop={
            streaming || attachmentState.busy
              ? () => {
                  attachmentState.cancel();
                  streamController.current?.abort();
                }
              : undefined
          }
          text={text}
        >
          {sentContext && <ContextInspector context={sentContext} label="Last sent context" />}

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
                disabled={attachmentState.busy || streaming}
                onClick={() => {
                  void attachmentState.build().catch(() => {});
                }}
              >
                Refresh context preview
              </Button>
            )}
          </div>
          {chatError && (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {chatError}
            </p>
          )}
          {streaming && (
            <p role="status" className="mb-2 text-xs">
              Writing answer…
            </p>
          )}
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
  "Summarize the attached pages",
  "What needs attention in these records?",
  "Create a project plan",
];
