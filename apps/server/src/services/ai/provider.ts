import { streamText } from "ai";
import { configuredChatModel, CHAT_INSTRUCTIONS, DEFAULT_CHAT_MODEL } from "./chat";
import { getStringEnv } from "../../shared/config/config";
import type { ServerOperationContext } from "../operations/context";

export type ProviderInput = {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxOutputTokens: number;
  instructions?: string;
  model?: string;
};
export type ProviderCursor = { responseId?: string | null; cursor?: number | null };
export type ProviderChunk = ProviderCursor & {
  text?: string;
  completed?: boolean;
  usage?: { inputTokens?: number; outputTokens?: number };
};

/** Background mode is an explicit deployment capability, never a model substitution. */
export function backgroundProviderEnabled(env: Record<string, unknown>) {
  return env.AI_PROVIDER_BACKGROUND_ENABLED === "true";
}

export async function* generateChatOutput(
  context: ServerOperationContext,
  input: ProviderInput,
  signal: AbortSignal,
  recovery: ProviderCursor = {},
  transport: typeof fetch = fetch,
): AsyncGenerator<ProviderChunk> {
  if (!backgroundProviderEnabled(context.env)) {
    if (recovery.responseId) throw new Error("CHAT_PROVIDER_RESUME_UNAVAILABLE");
    const result = streamText({
      model: configuredChatModel(context),
      instructions: input.instructions ?? CHAT_INSTRUCTIONS,
      messages: input.messages,
      maxOutputTokens: input.maxOutputTokens,
      abortSignal: signal,
      maxRetries: 0,
    });
    let completed = false;
    for await (const part of result.stream) {
      if (part.type === "text-delta") yield { text: part.text };
      else if (part.type === "error") throw new Error("CHAT_PROVIDER_FAILED");
      else if (part.type === "finish") {
        completed = true;
        yield {
          completed: true,
          usage: {
            inputTokens: part.totalUsage.inputTokens,
            outputTokens: part.totalUsage.outputTokens,
          },
        };
      }
    }
    if (!completed) throw new Error("CHAT_PROVIDER_INTERRUPTED");
    return;
  }
  const key = getStringEnv(context.env, "OPENAI_API_KEY");
  if (!key) throw new Error("CHAT_PROVIDER_KEY_REQUIRED");
  const url = recovery.responseId
    ? `https://api.openai.com/v1/responses/${encodeURIComponent(recovery.responseId)}?stream=true&starting_after=${recovery.cursor ?? -1}`
    : "https://api.openai.com/v1/responses";
  const response = await transport(url, {
    method: recovery.responseId ? "GET" : "POST",
    signal,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    ...(recovery.responseId
      ? {}
      : {
          body: JSON.stringify({
            model: input.model ?? getStringEnv(context.env, "AI_MODEL") ?? DEFAULT_CHAT_MODEL,
            instructions: input.instructions ?? CHAT_INSTRUCTIONS,
            input: input.messages,
            max_output_tokens: input.maxOutputTokens,
            background: true,
            stream: true,
            store: false,
          }),
        }),
  });
  if (!response.ok || !response.body) throw new Error(`CHAT_PROVIDER_HTTP_${response.status}`);
  let responseId = recovery.responseId;
  let cursor = recovery.cursor ?? -1;
  let completed = false;
  for await (const event of readProviderEvents(response.body, signal)) {
    if (typeof event.sequence_number !== "number" || event.sequence_number <= cursor) continue;
    cursor = event.sequence_number;
    if (event.response?.id) responseId = event.response.id;
    if (!responseId) throw new Error("CHAT_PROVIDER_RESPONSE_ID_MISSING");
    if (
      ["response.failed", "response.incomplete", "error", "response.cancelled"].includes(event.type)
    )
      throw new Error("CHAT_PROVIDER_FAILED");
    completed = event.type === "response.completed";
    yield {
      responseId,
      cursor,
      ...(event.type === "response.output_text.delta" ? { text: event.delta } : {}),
      ...(completed
        ? {
            completed: true,
            usage: {
              inputTokens: event.response?.usage?.input_tokens,
              outputTokens: event.response?.usage?.output_tokens,
            },
          }
        : {}),
    };
  }
  if (!completed) throw new Error("CHAT_PROVIDER_INTERRUPTED");
}

export async function cancelProviderResponse(context: ServerOperationContext, responseId: string) {
  const response = await fetch(
    `https://api.openai.com/v1/responses/${encodeURIComponent(responseId)}/cancel`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${getStringEnv(context.env, "OPENAI_API_KEY")}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok && response.status !== 409) throw new Error("CHAT_PROVIDER_CANCEL_FAILED");
}

async function* readProviderEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<any> {
  const reader = body.getReader();
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
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
      if (buffer.length > 2_000_000) throw new Error("CHAT_PROVIDER_EVENT_TOO_LARGE");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data && data !== "[DONE]") yield JSON.parse(data);
      }
      if (done) break;
    }
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
