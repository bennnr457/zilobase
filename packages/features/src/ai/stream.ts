import type { ChatEvent, ChatRequest } from "./contracts";
import { captureClientOperation, type ClientOperationContext } from "../shared/operation-context";

export async function consumeChatStream(
  response: Response,
  signal: AbortSignal,
  onEvent: (event: ChatEvent) => void,
) {
  if (!response.ok || !response.body) throw new Error("Chat stream unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const abort = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  let buffer = "";
  let finished = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as ChatEvent;
    if (!event || !["context", "delta", "done", "error"].includes(event.type))
      throw new Error("Invalid chat event");
    if (event.type === "delta" && typeof event.text !== "string")
      throw new Error("Invalid chat text");
    onEvent(event);
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "done") finished = true;
  };
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        consume(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
      }
      if (buffer.length > 2_000_000) throw new Error("Chat event exceeds size limit");
      if (done) break;
    }
    if (buffer) consume(buffer);
    if (!finished) throw new Error("Response interrupted. Your partial answer has been kept.");
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function sendChat(
  context: ClientOperationContext,
  request: ChatRequest,
  signal: AbortSignal,
  onEvent: (event: ChatEvent) => void,
) {
  const scope = captureClientOperation(context);
  if (!context.streamFetch) throw new Error("This client does not support streaming chat");
  scope.assertCurrent();
  signal.throwIfAborted();
  const response = await context.streamFetch("/ai/chat", {
    method: "POST",
    body: JSON.stringify(request),
    signal,
  });
  try {
    scope.assertCurrent();
    await consumeChatStream(response, signal, (event) => {
      scope.assertCurrent();
      onEvent(event);
    });
  } catch (error) {
    await response.body?.cancel().catch(() => {});
    throw error;
  }
}
