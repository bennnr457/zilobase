import type { ModelMessage } from "ai";
import type { ChatDebugEvent } from "@zilobase/features/runtime";
import type { AgentState } from "./agent-state";

const MAX_LOG_BYTES = 524_288;
const MAX_EVENT_BYTES = 32_768;

/** Keep raw reads in the encrypted checkpoint, never in public progress or server logs. */
export function recordDebugEvent(
  state: AgentState,
  type: ChatDebugEvent["type"],
  data: unknown,
  detail: Pick<ChatDebugEvent, "tool" | "toolCallId" | "durationMs"> = {},
) {
  const log = (state.debug ??= { events: [], bytes: 0, omitted: 0 });
  const raw = JSON.stringify(data) ?? "null";
  const truncated = Buffer.byteLength(raw) > MAX_EVENT_BYTES;
  const event: ChatDebugEvent = {
    id: log.events.length + 1,
    at: new Date().toISOString(),
    step: state.steps + 1,
    type,
    ...detail,
    payload: truncated ? Buffer.from(raw).subarray(0, MAX_EVENT_BYTES).toString("utf8") : raw,
    ...(truncated ? { truncated: true } : {}),
  };
  const bytes = Buffer.byteLength(JSON.stringify(event));
  if (log.bytes + bytes > MAX_LOG_BYTES || log.events.length >= 1000) {
    log.omitted++;
    return;
  }
  log.events.push(event);
  log.bytes += bytes;
}

/** Omit reasoning, provider metadata, and opaque provider options from model transcripts. */
export function debugModelMessages(messages: ModelMessage[]) {
  return messages.map((message) => {
    if (typeof message.content === "string")
      return { role: message.role, content: message.content };
    const content: Record<string, unknown>[] = [];
    for (const part of message.content) {
      if (part.type === "text") content.push({ type: part.type, text: part.text });
      if (part.type === "tool-call")
        content.push({
          type: part.type,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        });
      if (part.type === "tool-result")
        content.push({
          type: part.type,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: part.output,
        });
    }
    return { role: message.role, content };
  });
}
