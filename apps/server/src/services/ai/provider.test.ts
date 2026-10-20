import { expect, test, vi } from "vitest";
import { generateChatOutput } from "./provider";
import type { ServerOperationContext } from "../operations/context";
const context = {
  env: { AI_PROVIDER_BACKGROUND_ENABLED: "true", OPENAI_API_KEY: "test" },
} as unknown as ServerOperationContext;
test("provider recovery requests the original response cursor and ignores repeated events", async () => {
  const events = [
    { type: "response.output_text.delta", sequence_number: 4, delta: "duplicate" },
    { type: "response.output_text.delta", sequence_number: 5, delta: " suffix" },
    {
      type: "response.completed",
      sequence_number: 6,
      response: { id: "resp_1", usage: { output_tokens: 7 } },
    },
  ];
  const transport = vi.fn(
    async (_url: RequestInfo | URL) =>
      new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")),
  );
  const chunks = [];
  for await (const chunk of generateChatOutput(
    context,
    { messages: [], maxOutputTokens: 100 },
    new AbortController().signal,
    { responseId: "resp_1", cursor: 4 },
    transport as typeof fetch,
  ))
    chunks.push(chunk);
  expect(transport.mock.calls[0]?.[0]).toContain("resp_1?stream=true&starting_after=4");
  expect(chunks.map((chunk) => chunk.text).filter(Boolean)).toEqual([" suffix"]);
  expect(chunks.at(-1)?.completed).toBe(true);
});
test("a broken provider stream never reports a completed response", async () => {
  const transport = async () =>
    new Response(
      'data: {"type":"response.created","sequence_number":0,"response":{"id":"resp_1"}}\n\n',
    );
  await expect(
    (async () => {
      for await (const _ of generateChatOutput(
        context,
        { messages: [], maxOutputTokens: 100 },
        new AbortController().signal,
        {},
        transport as typeof fetch,
      )) {
      }
    })(),
  ).rejects.toThrow("INTERRUPTED");
});

test("background creation preserves the accepted model and parses split UTF-8 and CRLF frames", async () => {
  const events = [
    { type: "response.created", sequence_number: 0, response: { id: "resp_created" } },
    { type: "response.output_text.delta", sequence_number: 1, delta: "हाय" },
    { type: "response.completed", sequence_number: 2, response: { id: "resp_created" } },
  ];
  const bytes = new TextEncoder().encode(
    events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join(""),
  );
  const transport = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "accepted-model",
      background: true,
      stream: true,
      store: false,
    });
    return new Response(
      new ReadableStream({
        start(controller) {
          for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
          controller.close();
        },
      }),
    );
  });
  const chunks = [];
  for await (const chunk of generateChatOutput(
    context,
    { model: "accepted-model", messages: [], maxOutputTokens: 100 },
    new AbortController().signal,
    {},
    transport as typeof fetch,
  ))
    chunks.push(chunk);
  expect(chunks.map((chunk) => chunk.text).filter(Boolean)).toEqual(["हाय"]);
  expect(chunks.at(-1)).toMatchObject({ responseId: "resp_created", cursor: 2, completed: true });
  expect(transport).toHaveBeenCalledTimes(1);
});
