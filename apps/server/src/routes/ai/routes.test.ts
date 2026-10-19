import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  cancel: vi.fn(),
  signal: undefined as AbortSignal | undefined,
  finalized: false,
}));
vi.mock("../../services/ai/chat", () => ({ prepareChat: mocks.prepare }));
vi.mock("../http/operation-context", () => ({ serverOperationContext: () => ({}) }));
vi.mock("../../services/ai/conversations", () => ({
  listChatThreads: vi.fn(),
  getChatThread: vi.fn(),
  deleteChatThread: vi.fn(),
}));
import { aiRoutes } from "./routes";
const request = {
  workspaceId: "workspace",
  requestId: "11111111-1111-4111-8111-111111111111",
  text: "Hello",
  roots: [],
};
const post = (body: unknown) =>
  aiRoutes.request("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.signal = undefined;
  mocks.finalized = false;
});

test("HTTP adapter validates bounded snapshots and text before invoking the model service", async () => {
  expect(
    (
      await post({
        ...request,
        snapshots: [
          {
            pageId: "p",
            capturedAt: "2026-10-20T00:00:00Z",
            content: { type: "doc", content: "invalid" },
          },
        ],
      })
    ).status,
  ).toBe(400);
  expect((await post({ ...request, text: "x".repeat(2_000_001) })).status).toBe(413);
  expect(mocks.prepare).not.toHaveBeenCalled();
});

test("HTTP stream serializes context and deltas and finalizes the turn when the reader cancels", async () => {
  mocks.prepare.mockResolvedValue({
    cancel: mocks.cancel,
    async *events(signal: AbortSignal) {
      mocks.signal = signal;
      try {
        yield { type: "context", context: { markdown: "data" } };
        yield { type: "delta", text: "partial" };
        await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      } finally {
        mocks.finalized = true;
      }
    },
  });
  const response = await post(request);
  expect(response.headers.get("content-type")).toBe("application/x-ndjson");
  expect(response.headers.get("cache-control")).toBe("no-store");
  const reader = response.body!.getReader();
  expect(JSON.parse(new TextDecoder().decode((await reader.read()).value)).type).toBe("context");
  expect(JSON.parse(new TextDecoder().decode((await reader.read()).value))).toEqual({
    type: "delta",
    text: "partial",
  });
  await reader.cancel();
  expect(mocks.signal?.aborted).toBe(true);
  expect(mocks.finalized).toBe(true);
  expect(mocks.cancel).toHaveBeenCalledOnce();
});
