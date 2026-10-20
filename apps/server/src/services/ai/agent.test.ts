import { expect, test, vi } from "vitest";
vi.mock("../operations/context", async (original) => ({
  ...(await original<typeof import("../operations/context")>()),
  runServerOperation: async (_: unknown, run: () => Promise<unknown>) => run(),
}));
import { MockLanguageModelV4 } from "ai/test";
import type { ServerOperationContext } from "../operations/context";
import {
  compactAgentMessages,
  generateReadAgent,
  readAgentLimits,
  assertAgentPromptFits,
} from "./agent";
import { createAgentState, type AgentState } from "./agent-state";
import type { ReadToolDependencies } from "./read-tools";

const context = { env: {} } as ServerOperationContext;
const usage = {
  inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
test("agent reads through tools and commits their transcript before the next model step", async () => {
  const state = createAgentState(
    "workspace",
    [{ type: "page", id: "page" }],
    [{ role: "user", content: "Mentioned page:page. What is due?" }],
  );
  const checkpoints: AgentState[] = [];
  const document = vi.fn(async () => ({
    title: "Plan",
    revision: "1",
    offset: 0,
    hasMore: false,
    entries: [{ kind: "text", block: 0, text: "Due Friday" }],
  }));
  let step = 0;
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      const first = step++ === 0;
      if (first) expect(JSON.stringify(prompt)).not.toContain("Due Friday");
      else {
        expect(checkpoints.some((s) => s.messages.some((m) => m.role === "tool"))).toBe(true);
        expect(JSON.stringify(prompt)).toContain("Due Friday");
      }
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            if (first)
              controller.enqueue({
                type: "tool-call",
                toolCallId: "read",
                toolName: "read_page",
                input: JSON.stringify({ pageId: "page" }),
              });
            else {
              controller.enqueue({ type: "text-start", id: "answer" });
              controller.enqueue({
                type: "text-delta",
                id: "answer",
                delta: "Due Friday. [[page:page]]",
              });
              controller.enqueue({ type: "text-end", id: "answer" });
            }
            controller.enqueue({
              type: "finish",
              finishReason: {
                unified: first ? "tool-calls" : "stop",
                raw: first ? "tool_calls" : "stop",
              },
              usage,
            });
            controller.close();
          },
        }),
      };
    },
  });
  const dependencies = {
    document,
    authorizeWorkspace: async () => ({}),
  } as unknown as ReadToolDependencies;
  const chunks = [];
  for await (const chunk of generateReadAgent(context, state, new AbortController().signal, {
    model,
    dependencies,
    persistence: {
      checkpoint: async (s) => {
        checkpoints.push(s);
      },
    },
  }))
    chunks.push(chunk);
  expect(document).toHaveBeenCalledOnce();
  expect(
    chunks
      .filter((c) => c.text)
      .map((c) => c.text)
      .join(""),
  ).toBe("Due Friday. [[page:page]]");
  expect(chunks.at(-1)).toMatchObject({
    completed: true,
    usage: { inputTokens: 40, outputTokens: 10 },
  });
  expect(state.progress.activities[0]).toMatchObject({ id: "read", status: "completed" });
  expect(state.context.manifest[0]?.key).toBe("page:page");
  expect(state.messages.at(-1)?.role).toBe("assistant");
});

test("compaction removes whole tool exchanges and preserves the latest request", () => {
  const result = compactAgentMessages(
    [
      { role: "user", content: "original question" },
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "old", toolName: "read_page", input: {} }],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "old",
            toolName: "read_page",
            output: { type: "text", value: "x".repeat(4000) },
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "new", toolName: "read_page", input: {} }],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "new",
            toolName: "read_page",
            output: { type: "text", value: "latest evidence" },
          },
        ],
      },
    ],
    1000,
  );
  expect(result.omitted).toBe(1);
  expect(result.messages.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
  expect(JSON.stringify(result.messages)).not.toContain('"old"');
  expect(JSON.stringify(result.messages)).toContain("original question");
});

test("limits reject invalid deployment settings rather than silently exceeding them", () => {
  expect(() => readAgentLimits({ AI_MAX_STEPS: "0" })).toThrow(/AI_MAX_STEPS/);
  expect(() => readAgentLimits({ AI_CONTEXT_WINDOW_TOKENS: "invalid" })).toThrow(
    /AI_CONTEXT_WINDOW_TOKENS/,
  );
  expect(readAgentLimits({})).toMatchObject({ maxSteps: 12, maxCalls: 24, totalTokens: 128000 });
  expect(() => assertAgentPromptFits({}, [{ role: "user", content: "x".repeat(32768) }])).toThrow(
    /Shorten the question/,
  );
});
test("an exhausted context or usage budget completes with explicit coverage and no provider call", async () => {
  const state = createAgentState(
    "workspace",
    [{ type: "page", id: "page" }],
    [{ role: "user", content: "Read this source" }],
  );
  const model = new MockLanguageModelV4();
  const chunks = [];
  for await (const chunk of generateReadAgent(
    { ...context, env: { AI_RUN_TOKEN_BUDGET: "8192" } },
    state,
    new AbortController().signal,
    { model },
  ))
    chunks.push(chunk);
  expect(model.doStreamCalls).toHaveLength(0);
  expect(chunks.at(-1)).toMatchObject({
    completed: true,
    progress: { canContinue: true, stopReason: "token_budget" },
  });
  expect(state.context.status).toBe("partial");
});
