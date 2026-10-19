import { expect, test } from "vitest";
import { budgetHistory, chatBudget, promptBytes } from "./budget";
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
