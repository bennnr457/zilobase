import { terminalChatRun, type ChatRunReceipt } from "@zilobase/features/ai";
import type { ChatRequest } from "@zilobase/features/ai";
import {
  useSendChat,
  useFollowChatRun,
  useCancelChatRun,
  useRecoverChatSubmission,
  useChatThreads,
  useChatSelection,
} from "@zilobase/features/ai/react";
import { useChatAttachments } from "../../attachments/hooks/use-chat-attachments";
import { ContextInspector } from "../../attachments/components/context-inspector";
import type { BuildContextResult } from "@zilobase/page-context";
import { ChatLayout } from "./chat-layout";
import { Button } from "@/components/ui/button";
import { ChatbotComposer } from "../../composer/components/chatbot-composer";
import { ChatbotMessages, type ChatMessage } from "./chatbot-messages";
import { useSession } from "@zilobase/features/auth/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
  const follow = useFollowChatRun();
  const cancelRun = useCancelChatRun();
  const recoverSubmission = useRecoverChatSubmission();
  const activeRun = useRef<ChatRunReceipt | null>(null);
  const [streaming, setStreaming] = useState(false);
  const selection = useChatSelection(workspaceId ?? "");
  const threads = useChatThreads(
    workspaceId ?? "",
    selection.id,
    !streaming && !attachmentState.busy,
  );
  const loadedThread = useRef<string | null>(null);
  const activeSelection = useRef(selection.revision);
  useEffect(() => {
    if (selection.initialized || !threads.list.isSuccess || !workspaceId) return;
    let disposed = false;
    const revision = selection.revision;
    void recoverSubmission(workspaceId)
      .then((receipt) => {
        if (!disposed && selection.isCurrent(revision))
          selection.select(receipt?.threadId ?? threads.list.data?.[0]?.id ?? null);
      })
      .catch(() => {
        if (!disposed && selection.isCurrent(revision))
          selection.select(threads.list.data?.[0]?.id ?? null);
      });
    return () => {
      disposed = true;
    };
  }, [selection, threads.list.isSuccess, threads.list.data, workspaceId, recoverSubmission]);
  useEffect(() => {
    if (
      streaming ||
      !threads.detail.data ||
      threads.detail.data.thread.id !== selection.id ||
      loadedThread.current === selection.id
    )
      return;
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
  useLayoutEffect(
    () => () => {
      const controller = streamController.current;
      streamController.current = null;
      controller?.abort();
    },
    [],
  );
  useLayoutEffect(() => {
    if (activeSelection.current === selection.revision) return;
    activeSelection.current = selection.revision;
    const controller = streamController.current;
    streamController.current = null;
    controller?.abort();
    setStreaming(false);
    if (controller) void threads.refresh();
    loadedThread.current = null;
    activeRun.current = null;
    pendingRequest.current = null;
    setText("");
    setMessages([]);
    setSentContext(null);
    setChatError(null);
    attachmentState.reset();
  }, [selection.revision, attachmentState, threads]);
  // Reloading or switching threads attaches a subscriber to the existing producer.
  const savedRun = threads.detail.data?.run;
  const followedRun = useRef<string | null>(null);
  useEffect(() => {
    if (
      !savedRun ||
      terminalChatRun(savedRun.status) ||
      !workspaceId ||
      savedRun.threadId !== selection.id ||
      streamController.current ||
      loadedThread.current !== selection.id
    )
      return;
    const followKey = `${selection.revision}:${savedRun.runId}`;
    if (followedRun.current === followKey) return;
    followedRun.current = followKey;
    const controller = new AbortController();
    const revision = selection.revision;
    streamController.current = controller;
    activeRun.current = savedRun;
    setStreaming(true);
    void follow(savedRun, workspaceId, controller.signal, (run) => {
      if (!selection.isCurrent(revision) || controller.signal.aborted) return;
      activeRun.current = run;
      setMessages((current) =>
        current.map((message) =>
          message.id === `${run.turnId}:assistant`
            ? {
                ...message,
                text: run.text,
                status: terminalChatRun(run.status) ? run.status : "streaming",
              }
            : message,
        ),
      );
    })
      .catch((cause) => {
        if (!controller.signal.aborted && selection.isCurrent(revision))
          setChatError(cause instanceof Error ? cause.message : "Could not reconnect to answer");
      })
      .finally(() => {
        if (streamController.current === controller) {
          streamController.current = null;
          setStreaming(false);
          void threads.refresh();
        }
      });
    // Scope changes are handled by the selection/unmount cleanup above. A query
    // refresh must not disconnect the currently owned subscription.
  }, [savedRun, workspaceId, selection, follow, threads]);
  const threadReady =
    selection.initialized && (selection.id === null || loadedThread.current === selection.id);
  const onSubmit = async (message: PromptInputMessage) => {
    const nextText = message.text.trim();
    if (
      !nextText ||
      !threadReady ||
      streamController.current ||
      attachmentState.busy ||
      streaming ||
      !workspaceId
    )
      return;
    setChatError(null);
    activeRun.current = null;
    const controller = new AbortController();
    streamController.current = controller;
    const assistantId = crypto.randomUUID();
    let requestSelection = selection.revision;
    let accepted = false;
    try {
      const prepared = await attachmentState.build();
      if (!selection.isCurrent(requestSelection)) controller.abort();
      controller.signal.throwIfAborted();
      setStreaming(true);
      let nextRequest: ChatRequest = {
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
          threadId: request.threadId,
          text: request.text,
          roots: request.roots,
          snapshots: request.snapshots.map(({ pageId, content }) => ({ pageId, content })),
        });
      if (pendingRequest.current && signature(pendingRequest.current) === signature(nextRequest))
        nextRequest = pendingRequest.current;
      pendingRequest.current = nextRequest;
      await send(nextRequest, controller.signal, (event) => {
        if (!selection.isCurrent(requestSelection) || controller.signal.aborted) {
          controller.abort();
          return;
        }
        if (event.type === "context") {
          if (event.threadId) {
            loadedThread.current = event.threadId;
            requestSelection = selection.select(event.threadId).revision;
            activeSelection.current = requestSelection;
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
        } else if (event.type === "snapshot") {
          activeRun.current = event.run;
          setMessages((current) =>
            current.map((entry) =>
              entry.id === assistantId
                ? {
                    ...entry,
                    text: event.run.text,
                    status: terminalChatRun(event.run.status) ? event.run.status : "streaming",
                  }
                : entry,
            ),
          );
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
      if (streamController.current !== controller || !selection.isCurrent(requestSelection)) return;
      if (!controller.signal.aborted)
        setChatError(cause instanceof Error ? cause.message : "Could not send message");
      if (accepted && !activeRun.current)
        setMessages((current) =>
          current.map((entry) =>
            entry.id === assistantId
              ? { ...entry, status: controller.signal.aborted ? "stopped" : "failed" }
              : entry,
          ),
        );
      if (!controller.signal.aborted && !accepted) setText(nextText);
    } finally {
      if (streamController.current === controller) {
        streamController.current = null;
        setStreaming(false);
        void threads.refresh();
      }
    }
  };
  const hasMessages = messages.length > 0;
  const centerEmptyState = !isSidebar && !hasMessages && threadReady;
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
          {!threadReady && !threads.detail.isError && (
            <p role="status" className="py-6 text-center text-sm text-content-secondary">
              Loading conversation…
            </p>
          )}
          {threadReady && !hasMessages && (
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
          {threadReady && hasMessages && (
            <ChatbotMessages isSidebar={isSidebar} messages={messages} />
          )}
        </ChatLayout>
      </div>
      <ChatLayout sidebar={isSidebar}>
        {beforeComposer}
        {threads.detail.isError && (
          <div className="mb-2 flex items-center justify-between gap-2">
            <p role="alert" className="text-sm text-action-danger-text">
              {threads.detail.error.message}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void threads.detail.refetch();
              }}
            >
              Retry
            </Button>
          </div>
        )}

        <ChatbotComposer
          isSidebar={isSidebar}
          onSubmit={onSubmit}
          onTextChange={setText}
          workspaceId={workspaceId}
          onAttach={attachmentState.add}
          disabled={!threadReady || attachmentState.busy || streaming}
          rootRef={rootRef}
          onStop={
            streaming || attachmentState.busy
              ? () => {
                  attachmentState.cancel();
                  const run = activeRun.current;
                  if (run && workspaceId) {
                    void cancelRun(run.runId, workspaceId).catch((cause) =>
                      setChatError(
                        cause instanceof Error ? cause.message : "Could not stop answer",
                      ),
                    );
                  } else streamController.current?.abort();
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
            <p role="alert" className="mb-2 text-sm text-action-danger-text">
              {chatError}
              {activeRun.current && !terminalChatRun(activeRun.current.status) && !streaming && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    followedRun.current = null;
                    loadedThread.current = null;
                    setChatError(null);
                    void threads.refresh();
                  }}
                >
                  Reconnect
                </Button>
              )}
            </p>
          )}
          {!streaming && ["failed", "interrupted"].includes(messages.at(-1)?.status ?? "") && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                const previous = [...messages].reverse().find((message) => message.role === "user");
                if (!previous) return;
                pendingRequest.current = null;
                void onSubmit({ text: previous.text, files: [] });
              }}
            >
              Retry answer
            </Button>
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
            <p role="alert" className="mb-2 text-sm text-action-danger-text">
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
