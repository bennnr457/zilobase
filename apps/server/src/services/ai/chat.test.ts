import { expect, test, vi } from "vitest";
vi.mock("../operations/context", async (original) => ({
  ...(await original<typeof import("../operations/context")>()),
  runServerOperation: async (_context: unknown, run: () => Promise<unknown>) => run(),
}));
import { MockLanguageModelV4 } from "ai/test";
import { prepareChat } from "./chat";
import type { ServerOperationContext } from "../operations/context";
import type { ChatRequest } from "@zilobase/features/runtime";
import type { BuildContextResult } from "@zilobase/page-context";

const request: ChatRequest = {
  workspaceId: "workspace",
  requestId: "11111111-1111-4111-8111-111111111111",
  text: "What is due?",
  roots: [],
  snapshots: [],
  history: [],
};
const built: BuildContextResult = {
  version: 1,
  status: "complete",
  markdown: "Due Friday",
  charCount: 10,
  manifest: [],
  omissions: [],
  trimmedAttachmentIds: [],
};
const context = { env: {} } as ServerOperationContext;

test("chat sends authorized context to the SDK and emits text plus usage", async () => {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "text" });
          controller.enqueue({ type: "text-delta", id: "text", delta: "Friday." });
          controller.enqueue({ type: "text-end", id: "text" });
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 3, text: 3, reasoning: 0 },
            },
          });
          controller.close();
        },
      }),
    }),
  });
  const authorize = vi.fn(
    async () => ({}) as Awaited<ReturnType<typeof import("./context").authorizeChatWorkspace>>,
  );
  const prepared = await prepareChat(context, request, {
    authorize,
    model: () => model,
    assemble: async () => built,
    begin: async () => ({ threadId: "thread", turns: [], replay: null }),
    finish: async () => {},
  });
  const events = [];
  for await (const event of prepared.events(new AbortController().signal)) events.push(event);
  expect(authorize).toHaveBeenCalledOnce();
  expect(events.map((event) => event.type)).toEqual(["context", "delta", "done"]);
  expect(events[1]).toEqual({ type: "delta", text: "Friday." });
  expect(model.doStreamCalls[0]?.prompt).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: "user",
        content: expect.arrayContaining([
          expect.objectContaining({ text: expect.stringContaining("Due Friday") }),
        ]),
      }),
    ]),
  );
});

test("authorization failure prevents provider setup and streaming", async () => {
  const model = vi.fn();
  await expect(
    prepareChat(context, request, {
      authorize: async () => {
        throw new Error("Forbidden");
      },
      assemble: async () => built,
      begin: async () => ({ threadId: "thread", turns: [], replay: null }),
      finish: async () => {},
      model,
    }),
  ).rejects.toThrow("Forbidden");
  expect(model).not.toHaveBeenCalled();
});
