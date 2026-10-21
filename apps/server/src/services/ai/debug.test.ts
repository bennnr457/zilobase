import { expect, test } from "vitest";
import { createAgentState } from "./agent-state";
import { debugModelMessages, recordDebugEvent } from "./debug";

test("debug captures are bounded and disclose truncated payloads and omitted events", () => {
  const state = createAgentState("workspace", [], []);
  for (let i = 0; i < 100; i++)
    recordDebugEvent(state, "model.request", { text: "🚀".repeat(20_000) });
  expect(state.debug!.bytes).toBeLessThanOrEqual(524_288);
  expect(state.debug!.events[0]!.truncated).toBe(true);
  expect(state.debug!.omitted).toBeGreaterThan(0);
  expect(new Set(state.debug!.events.map((event) => event.id)).size).toBe(
    state.debug!.events.length,
  );
});

test("model transcript keeps text and tools while excluding reasoning and opaque metadata", () => {
  const messages = debugModelMessages([
    { role: "user", content: "Question" },
    {
      role: "assistant",
      content: [
        {
          type: "reasoning",
          text: "Hidden reasoning",
          providerOptions: { openai: { encrypted: "opaque" } },
        },
        {
          type: "text",
          text: "Checking the page",
          providerOptions: { openai: { metadata: "opaque" } },
        },
        { type: "tool-call", toolCallId: "call", toolName: "read_page", input: { pageId: "page" } },
      ],
    },
  ]);
  expect(JSON.stringify(messages)).not.toMatch(/reasoning|opaque|providerOptions/);
  expect(messages[1]!.content).toHaveLength(2);
});
