import type { ModelMessage } from "ai";
import { getStringEnv, type RuntimeEnv } from "../../shared/config/config";
import { ServerOperationError } from "../operations/context";
import { Tiktoken, getEncodingNameForModel, type TiktokenModel } from "js-tiktoken/lite";
import o200k from "js-tiktoken/ranks/o200k_base";
import cl100k from "js-tiktoken/ranks/cl100k_base";

const encoder = new TextEncoder();
export const promptBytes = (text: string) => encoder.encode(text).length;

const tokenizers = new Map<string, Tiktoken>();
/** Unknown/custom models retain the UTF-8 upper bound unless their encoding is configured. */
export function chatTokenCounter(env: Record<string, unknown>, model: string) {
  let encoding = String(env.AI_TOKENIZER_ENCODING ?? "").trim();
  if (encoding && !["o200k_base", "cl100k_base", "utf8_bound"].includes(encoding))
    throw new ServerOperationError(
      { error: "AI_TOKENIZER_ENCODING must be o200k_base, cl100k_base or utf8_bound" },
      503,
    );
  if (!encoding) {
    try {
      encoding = getEncodingNameForModel(model as TiktokenModel);
    } catch {
      encoding = "utf8_bound";
    }
  }
  if (encoding !== "o200k_base" && encoding !== "cl100k_base")
    return { encoding: "utf8_bound", count: promptBytes };
  let tokenizer = tokenizers.get(encoding);
  if (!tokenizer) {
    tokenizer = new Tiktoken(encoding === "o200k_base" ? o200k : cl100k);
    tokenizers.set(encoding, tokenizer);
  }
  return { encoding, count: (text: string) => tokenizer.encode(text, [], []).length };
}

export type AgentUsage = {
  version: 1;
  actualInput: number;
  actualOutput: number;
  uncertain: number;
  nextAttempt: number;
  pending?: { attempt: number; input: number; output: number };
};
type UsageOwner = {
  usage?: AgentUsage;
  chargedTokens: number;
  inputTokens: number;
  outputTokens: number;
};
export const newAgentUsage = (): AgentUsage => ({
  version: 1,
  actualInput: 0,
  actualOutput: 0,
  uncertain: 0,
  nextAttempt: 0,
});
export function usageCharge(state: UsageOwner) {
  const usage = state.usage;
  return usage
    ? usage.actualInput +
        usage.actualOutput +
        usage.uncertain +
        (usage.pending ? usage.pending.input + usage.pending.output : 0)
    : state.chargedTokens;
}
/** A lost response cannot be assumed free. Legacy counters remain conservative, not measured usage. */
export function recoverAgentUsage(state: UsageOwner) {
  state.usage ??= { ...newAgentUsage(), uncertain: state.chargedTokens };
  if (state.usage.pending) {
    state.usage.uncertain += state.usage.pending.input + state.usage.pending.output;
    delete state.usage.pending;
  }
  state.chargedTokens = usageCharge(state);
}
export function reserveAgentUsage(state: UsageOwner, input: number, output: number) {
  const usage = state.usage!;
  if (usage.pending) throw new Error("CHAT_USAGE_RESERVATION_ACTIVE");
  const attempt = ++usage.nextAttempt;
  usage.pending = { attempt, input, output };
  state.chargedTokens = usageCharge(state);
  return attempt;
}
export function settleAgentUsage(
  state: UsageOwner,
  attempt: number,
  input: number | undefined,
  output: number | undefined,
) {
  const usage = state.usage!;
  const pending = usage.pending;
  if (!pending || pending.attempt !== attempt) return;
  const known = (value: number | undefined): value is number =>
    value !== undefined && Number.isFinite(value) && value >= 0;
  if (known(input)) usage.actualInput += input;
  else usage.uncertain += pending.input;
  if (known(output)) usage.actualOutput += output;
  else usage.uncertain += pending.output;
  state.inputTokens += known(input) ? input : pending.input;
  state.outputTokens += known(output) ? output : pending.output;
  delete usage.pending;
  state.chargedTokens = usageCharge(state);
}

export function usageSnapshot(state: UsageOwner) {
  return { ...state.usage, charged: usageCharge(state) };
}

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
