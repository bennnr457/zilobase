import { expect, test } from "vitest";
import {
  budgetHistory,
  chatBudget,
  promptBytes,
  chatTokenCounter,
  newAgentUsage,
  recoverAgentUsage,
  reserveAgentUsage,
  settleAgentUsage,
  usageCharge,
} from "./budget";
test("model budget reserves output and accounts for multibyte text", () => {
  const budget = chatBudget({ AI_CONTEXT_WINDOW_TOKENS: "8192" }, "instructions", "हाय", true);
  expect(
    budget.contextBytes +
      budget.historyBytes +
      budget.output +
      1024 +
      promptBytes("instructions") +
      promptBytes("हाय"),
  ).toBe(8192);
  expect(() => chatBudget({ AI_CONTEXT_WINDOW_TOKENS: "bad" }, "", "", false)).toThrow();
});
test("history budgeting keeps whole recent exchanges and reports older omissions", () => {
  const result = budgetHistory(
    [
      { userText: "old", assistantText: "x".repeat(1000), status: "completed" },
      { userText: "new", assistantText: "answer", status: "completed" },
    ],
    100,
  );
  expect(result.omitted).toBe(1);
  expect(result.messages).toEqual([
    { role: "user", content: "new" },
    { role: "assistant", content: "answer" },
  ]);
});

test("usage reservations settle once, retaining conservative charges for unknown usage and recovery", () => {
  const state = { usage: newAgentUsage(), chargedTokens: 0, inputTokens: 0, outputTokens: 0 };
  recoverAgentUsage(state);
  const first = reserveAgentUsage(state, 1000, 4096);
  settleAgentUsage(state, first, 100, 20);
  settleAgentUsage(state, first, 100, 20);
  expect(usageCharge(state)).toBe(120);
  const second = reserveAgentUsage(state, 1000, 4096);
  settleAgentUsage(state, second, 200, undefined);
  expect(usageCharge(state)).toBe(120 + 200 + 4096);
  reserveAgentUsage(state, 1000, 4096);
  const checkpoint = JSON.parse(JSON.stringify(state));
  recoverAgentUsage(checkpoint);
  expect(usageCharge(checkpoint)).toBe(120 + 200 + 4096 + 5096);
  expect(checkpoint.usage.pending).toBeUndefined();
  const legacy = { chargedTokens: 9000, inputTokens: 10, outputTokens: 10 };
  recoverAgentUsage(legacy);
  expect(usageCharge(legacy)).toBe(9000);
});
test("token counting uses a supported model encoding or an explicit conservative fallback", () => {
  const text = "A simple test of token estimation. ".repeat(100);
  const known = chatTokenCounter({}, "gpt-4o");
  expect(known.encoding).toBe("o200k_base");
  expect(known.count(text)).toBeLessThan(promptBytes(text));
  expect(chatTokenCounter({}, "custom-model").count(text)).toBe(promptBytes(text));
  expect(chatTokenCounter({ AI_TOKENIZER_ENCODING: "cl100k_base" }, "custom-model").encoding).toBe(
    "cl100k_base",
  );
  expect(() => chatTokenCounter({ AI_TOKENIZER_ENCODING: "invalid" }, "custom-model")).toThrow(
    /AI_TOKENIZER_ENCODING/,
  );
});
