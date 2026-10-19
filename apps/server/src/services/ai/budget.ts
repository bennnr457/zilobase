import type { ModelMessage } from "ai";
import { getStringEnv, type RuntimeEnv } from "../../shared/config/config";
import { ServerOperationError } from "../operations/context";

const encoder = new TextEncoder();
export const promptBytes = (text: string) => encoder.encode(text).length;

export function chatBudget(
  env: RuntimeEnv,
  instructions: string,
  question: string,
  hasHistory: boolean,
) {
  const configured = getStringEnv(env, "AI_CONTEXT_WINDOW_TOKENS");
  const window = configured ? Number(configured) : 32_768;
  if (!Number.isSafeInteger(window) || window < 8192 || window > 2_000_000)
    throw new ServerOperationError(
      {
        error:
          "AI_CONTEXT_WINDOW_TOKENS must describe the configured model's context window (8192–2000000)",
      },
      503,
    );
  const output = 4096;
  // OpenAI byte-level tokenizers cannot use more text tokens than UTF-8 bytes.
  // This deliberately conservative bound is separate from HTTP/character limits.
  const remaining = window - output - 1024 - promptBytes(instructions) - promptBytes(question);
  if (remaining < 512)
    throw new ServerOperationError(
      { error: "The message is too large for the configured model" },
      422,
    );
  const historyBytes = hasHistory ? Math.floor(remaining / 4) : 0;
  return { output, contextBytes: remaining - historyBytes, historyBytes };
}

export function budgetHistory(
  turns: Array<{ userText: string; assistantText: string; status: string }>,
  maxBytes: number,
) {
  const included: ModelMessage[] = [];
  let used = 0,
    count = 0;
  const eligible = turns.filter((turn) => turn.status === "completed");
  for (const turn of [...eligible].reverse()) {
    const size = promptBytes(turn.userText) + promptBytes(turn.assistantText) + 64;
    if (used + size > maxBytes || count >= 15) break;
    included.unshift(
      { role: "user", content: turn.userText },
      { role: "assistant", content: turn.assistantText },
    );
    used += size;
    count++;
  }
  return { messages: included, omitted: eligible.length - count };
}
