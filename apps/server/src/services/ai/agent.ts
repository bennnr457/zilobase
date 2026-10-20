import { ToolLoopAgent, isStepCount, type LanguageModel, type ModelMessage } from "ai";
import type { ServerOperationContext } from "../operations/context";
import { ServerOperationError } from "../operations/context";
import { configuredChatModel, CHAT_INSTRUCTIONS } from "./chat";
import { createReadTools, readToolSchemaBytes, type ReadToolDependencies } from "./read-tools";
import { updateReadCoverage, type AgentState } from "./agent-state";
import { promptBytes } from "./budget";
import type { ProviderChunk } from "./provider";

export type AgentPersistence = { checkpoint: (state: AgentState) => Promise<void> };
export function readAgentLimits(env: Record<string, unknown>) {
  const integer = (name: string, fallback: number, min: number, max: number) => {
    const value = env[name] == null || env[name] === "" ? fallback : Number(env[name]);
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new ServerOperationError({ error: `${name} must be between ${min} and ${max}` }, 503);
    return value;
  };
  return {
    window: integer("AI_CONTEXT_WINDOW_TOKENS", 32_768, 8192, 2_000_000),
    maxSteps: integer("AI_MAX_STEPS", 12, 2, 30),
    maxCalls: integer("AI_MAX_TOOL_CALLS", 24, 1, 100),
    maxResultBytes: integer("AI_TOOL_RESULT_BYTES", 6000, 4096, 16_384),
    totalTokens: integer("AI_RUN_TOKEN_BUDGET", 128_000, 8192, 1_000_000),
    output: 4096,
  };
}

/** Remove complete assistant/tool exchanges, never orphan a tool result. */
export function compactAgentMessages(messages: ModelMessage[], maxBytes: number) {
  const result = [...messages];
  let omitted = 0;
  while (promptBytes(JSON.stringify(result)) > maxBytes) {
    // Preserve the latest user request and at least its newest tool exchange.
    const lastUser = result.findLastIndex((m) => m.role === "user");
    if (lastUser > 0) {
      result.splice(0, lastUser);
      omitted++;
      continue;
    }
    const firstAssistant = result.findIndex((m) => m.role === "assistant");
    if (firstAssistant < 0) break;
    let end = firstAssistant + 1;
    while (end < result.length && result[end]!.role === "tool") end++;
    if (end === result.length) break;
    result.splice(firstAssistant, end - firstAssistant);
    omitted++;
  }
  return { messages: result, omitted, bytes: promptBytes(JSON.stringify(result)) };
}

export function assertAgentPromptFits(env: Record<string, unknown>, messages: ModelMessage[]) {
  const limits = readAgentLimits(env);
  const available =
    limits.window -
    limits.output -
    1024 -
    512 -
    promptBytes(CHAT_INSTRUCTIONS) -
    readToolSchemaBytes;
  if (compactAgentMessages(messages, available).bytes > available)
    throw new ServerOperationError(
      {
        error:
          "The question and source references exceed the configured model context. Shorten the question or mention fewer sources.",
      },
      422,
    );
}

export async function* generateReadAgent(
  context: ServerOperationContext,
  state: AgentState,
  signal: AbortSignal,
  options: {
    model?: LanguageModel;
    transport?: typeof fetch;
    persistence?: AgentPersistence;
    dependencies?: ReadToolDependencies;
  } = {},
): AsyncGenerator<ProviderChunk> {
  const limits = readAgentLimits(context.env);
  const updates: ProviderChunk[] = [];
  let saving = Promise.resolve();
  const changed = async () => {
    updateReadCoverage(state);
    const copy = structuredClone(state);
    saving = saving.then(() => options.persistence?.checkpoint(copy));
    await saving;
    if (!options.persistence) updates.push({ context: copy.context, progress: copy.progress });
  };
  const tools = createReadTools(context, state, {
    signal,
    maxCalls: limits.maxCalls,
    maxResultBytes: limits.maxResultBytes,
    changed,
    dependencies: options.dependencies,
  });
  let preparedMessages = state.messages;
  let separator = "";
  const agent = new ToolLoopAgent({
    model: options.model ?? configuredChatModel(context, options.transport),
    instructions: CHAT_INSTRUCTIONS,
    tools,
    stopWhen: isStepCount(Math.max(1, limits.maxSteps - state.steps)),
    maxOutputTokens: limits.output,
    maxRetries: 0,
    prepareStep: async ({ messages }) => {
      signal.throwIfAborted();
      const final = state.steps >= limits.maxSteps - 1 || state.calls >= limits.maxCalls;
      const available =
        limits.window -
        limits.output -
        1024 -
        512 -
        promptBytes(CHAT_INSTRUCTIONS) -
        readToolSchemaBytes;
      const compacted = compactAgentMessages(
        messages,
        available - (final ? 0 : limits.maxResultBytes),
      );
      if (compacted.bytes > available) throw new Error("CHAT_CONTEXT_BUDGET_EXHAUSTED");
      state.omittedResults += compacted.omitted;
      preparedMessages = compacted.messages;
      const estimated =
        compacted.bytes + promptBytes(CHAT_INSTRUCTIONS) + readToolSchemaBytes + 1024 + 512;
      if (state.chargedTokens + estimated + limits.output > limits.totalTokens) {
        state.progress.stopReason = "token_budget";
        throw new Error("CHAT_USAGE_BUDGET_EXHAUSTED");
      }
      if (final)
        state.progress.stopReason = state.calls >= limits.maxCalls ? "tool_budget" : "step_budget";
      // Reserve conservatively before dispatch, including uncertain failed attempts.
      state.chargedTokens += estimated + limits.output;
      state.messages = preparedMessages;
      await changed();
      return {
        messages: preparedMessages,
        instructions:
          CHAT_INSTRUCTIONS +
          `\nCurrent UTC time: ${new Date().toISOString()}. Runtime coverage: ${state.context.omissions.join(" ")}${final ? " This is the final step. Summarize available evidence and disclose remaining work." : ""}`,
        ...(final ? { toolChoice: "none" as const } : {}),
      };
    },
    onStepEnd: async (step) => {
      state.steps++;
      state.inputTokens +=
        step.usage.inputTokens ??
        promptBytes(JSON.stringify(preparedMessages)) + readToolSchemaBytes;
      state.outputTokens +=
        step.usage.outputTokens ?? promptBytes(JSON.stringify(step.response.messages));
      state.messages = [...preparedMessages, ...step.response.messages];
      separator = step.toolCalls.length && step.text ? "\n\n" : "";
      state.committedText += step.text + separator;
      await changed();
    },
  });
  // A replacement worker discards only uncommitted text from the failed step.
  yield { replaceText: state.committedText, context: state.context, progress: state.progress };
  let completed = false;
  try {
    const result = await agent.stream({ messages: state.messages, abortSignal: signal });
    for await (const part of result.stream) {
      signal.throwIfAborted();
      while (updates.length) yield updates.shift()!;
      if (part.type === "text-delta") yield { text: part.text };
      else if (part.type === "finish-step" && separator) {
        yield { text: separator };
        separator = "";
      } else if (part.type === "error")
        throw part.error instanceof Error ? part.error : new Error("CHAT_PROVIDER_FAILED");
      else if (part.type === "finish") {
        if (["error", "other"].includes(part.finishReason))
          throw new Error("CHAT_PROVIDER_INTERRUPTED");
        completed = true;
      }
    }
  } catch (error) {
    if (signal.aborted) throw error;
    if (
      !(error instanceof Error) ||
      !["CHAT_CONTEXT_BUDGET_EXHAUSTED", "CHAT_USAGE_BUDGET_EXHAUSTED"].includes(error.message)
    )
      throw error;
    state.progress.stopReason ??= "context_budget";
    const text =
      "\n\nReading reached this run's limit. The available evidence may be partial; continue reading to inspect remaining pages.";
    state.committedText += text;
    await changed();
    yield { text };
    completed = true;
  }
  while (updates.length) yield updates.shift()!;
  await saving;
  if (!completed) throw new Error("CHAT_PROVIDER_INTERRUPTED");
  yield {
    completed: true,
    context: state.context,
    progress: state.progress,
    usage: { inputTokens: state.inputTokens, outputTokens: state.outputTokens },
  };
}
