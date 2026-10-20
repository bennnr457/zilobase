import type { ClientOperationContext } from "../shared/operation-context";
import { captureClientOperation } from "../shared/operation-context";
import type { ChatRequest } from "./contracts";
import {
  applyChatRunEvent,
  chatRunEnvelopeSchema,
  terminalChatRun,
  type ChatRunReceipt,
} from "./runs";
import { chatThreadsKey } from "./queries";

export type ChatSubmission = { requestId: string; workspaceId: string; createdAt: number };
export type ChatReceiptStorage = {
  load(scope: string): Promise<ChatSubmission | null>;
  write(scope: string, value: ChatSubmission | null): Promise<void>;
  clear(scope: string, requestId: string): Promise<void>;
};
export type DurableChatContext = ClientOperationContext & { chatReceipts?: ChatReceiptStorage };
const receiptScope = (identity: unknown, workspaceId: string) =>
  JSON.stringify([identity, workspaceId]);
export async function chatCapabilities(context: ClientOperationContext) {
  const scope = captureClientOperation(context);
  return context.queryClient.fetchQuery({
    queryKey: ["ai", "capabilities"],
    staleTime: 30_000,
    queryFn: () => scope.context.apiFetch<{ durable: boolean }>("/ai/capabilities"),
  });
}
export async function submitChatRun(
  context: DurableChatContext,
  request: ChatRequest,
  signal: AbortSignal,
) {
  const scope = captureClientOperation(context);
  const key = receiptScope(scope.read.identity, request.workspaceId);
  await context.chatReceipts?.write(key, {
    requestId: request.requestId,
    workspaceId: request.workspaceId,
    createdAt: Date.now(),
  });
  scope.assertCurrent();
  signal.throwIfAborted();
  const run = await scope.context.apiFetch<ChatRunReceipt>("/ai/turns", {
    method: "POST",
    body: JSON.stringify(request),
    signal,
  });
  void context.queryClient.invalidateQueries({ queryKey: chatThreadsKey(request.workspaceId) });
  return run;
}
export async function recoverChatSubmission(
  context: DurableChatContext,
  workspaceId: string,
): Promise<ChatRunReceipt | null> {
  if (!context.chatReceipts) return null;
  const scope = captureClientOperation(context);
  const key = receiptScope(scope.read.identity, workspaceId);
  const pending = await context.chatReceipts.load(key);
  scope.assertCurrent();
  if (!pending || pending.workspaceId !== workspaceId || Date.now() - pending.createdAt > 3600_000)
    return null;
  try {
    return await scope.context.apiFetch<ChatRunReceipt>(
      `/ai/requests/${encodeURIComponent(pending.requestId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
  } catch (error) {
    if (httpStatus(error) === 404) return null;
    throw error;
  }
}
export async function cancelChatRun(
  context: ClientOperationContext,
  runId: string,
  workspaceId: string,
) {
  const scope = captureClientOperation(context);
  return scope.context.apiFetch<ChatRunReceipt>(
    `/ai/runs/${encodeURIComponent(runId)}/cancel?workspaceId=${encodeURIComponent(workspaceId)}`,
    { method: "POST" },
  );
}

/** A subscription is disposable; it never sends a producer cancellation request. */
export async function followChatRun(
  context: DurableChatContext,
  initial: ChatRunReceipt,
  workspaceId: string,
  signal: AbortSignal,
  publish: (run: ChatRunReceipt) => void,
) {
  const scope = captureClientOperation(context);
  if (!context.streamFetch) throw new Error("This client does not support streaming chat");
  let run = initial;
  let failures = 0;
  const emit = () => {
    scope.assertCurrent();
    signal.throwIfAborted();
    publish(run);
  };
  emit();
  while (!terminalChatRun(run.status)) {
    scope.assertCurrent();
    signal.throwIfAborted();
    try {
      const response = await context.streamFetch(
        `/ai/runs/${encodeURIComponent(run.runId)}/events?workspaceId=${encodeURIComponent(workspaceId)}&after=${run.seq}`,
        { method: "GET", signal },
      );
      scope.assertCurrent();
      if (!response.ok) {
        const error = new Error("Could not reconnect to the answer") as Error & { status: number };
        error.status = response.status;
        throw error;
      }
      for await (const value of readLines(response, signal)) {
        scope.assertCurrent();
        signal.throwIfAborted();
        if (value.type === "snapshot") {
          // Read snapshots through the authenticated API and validate their run identity.
          const fresh = await scope.context.apiFetch<ChatRunReceipt>(
            `/ai/runs/${encodeURIComponent(run.runId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
            { signal },
          );
          if (fresh.runId !== run.runId) throw new Error("CHAT_RUN_MISMATCH");
          run = fresh;
        } else {
          const event = chatRunEnvelopeSchema.parse(value);
          run = { ...run, ...applyChatRunEvent(run, event) };
        }
        failures = 0;
        emit();
      }
      if (!terminalChatRun(run.status)) await pause(100, signal);
    } catch (error) {
      scope.assertCurrent();
      signal.throwIfAborted();
      if ([401, 403, 404, 409].includes(httpStatus(error)) || ++failures > 6) throw error;
      await pause(Math.min(8000, 250 * 2 ** failures), signal);
      // The next subscription replays from the last acknowledged cursor. A gap
      // produces a snapshot reset, so offline snapshot reads need no separate retry loop.
    }
  }
  if (scope.isCurrent()) {
    const key = receiptScope(scope.read.identity, workspaceId);
    await context.chatReceipts?.clear(key, run.requestId);
    scope.assertCurrent();
    void context.queryClient.invalidateQueries({ queryKey: ["ai", workspaceId] });
  }
  return run;
}
function httpStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error
    ? Number(error.status)
    : 0;
}
async function* readLines(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  if (!response.body) throw new Error("Chat stream unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 2_000_000) throw new Error("Chat event exceeds size limit");
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (line.trim()) yield JSON.parse(line);
      }
      if (done) break;
    }
    if (buffer.trim()) yield JSON.parse(buffer);
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
