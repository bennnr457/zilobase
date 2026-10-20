import { beforeEach, expect, test, vi } from "vitest";
import type { ChatRunReceipt } from "@zilobase/features/runtime";
import type { ServerOperationContext } from "../../services/operations/context";
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../../services/ai/runs", () => ({
  readChatRunPageInScope: mocks.read,
  isRunTerminal: (status: string) => !["queued", "running"].includes(status),
}));
import { chatRunResponse, legacyChatRunResponse } from "./durable-stream";
const context = { env: {} } as ServerOperationContext;
const receipt: ChatRunReceipt = {
  runId: "run",
  threadId: "thread",
  turnId: "turn",
  requestId: "turn",
  seq: 1,
  text: "Saved",
  status: "running",
};
beforeEach(() => vi.clearAllMocks());
test("legacy wrapper replays saved text and a contiguous suffix using the old protocol", async () => {
  mocks.read.mockResolvedValue({
    snapshot: { ...receipt, seq: 3, status: "completed" },
    reset: false,
    events: [
      { seq: 2, event: { type: "delta", text: " suffix" } },
      { seq: 3, event: { type: "done", status: "completed" } },
    ],
  });
  const frames = (await legacyChatRunResponse(context, receipt).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(frames.map((item) => item.type)).toEqual(["context", "delta", "delta", "done"]);
  expect(
    frames
      .filter((item) => item.type === "delta")
      .map((item) => item.text)
      .join(""),
  ).toBe("Saved suffix");
});
test("legacy snapshot reset emits only unseen suffix text", async () => {
  mocks.read.mockResolvedValue({
    snapshot: { ...receipt, seq: 9, text: "Saved suffix", status: "completed" },
    reset: true,
    events: [],
  });
  const body = await legacyChatRunResponse(context, receipt).text();
  expect(body).toContain('"text":" suffix"');
  expect(body).not.toContain('"text":"Saved suffix"');
});
test("closing a subscriber requires no cancellation or finalization of its run", async () => {
  mocks.read.mockResolvedValue({ snapshot: receipt, reset: false, events: [] });
  const reader = chatRunResponse(context, receipt, 1).body!.getReader();
  await reader.read();
  await reader.cancel();
  expect(mocks.read).toHaveBeenCalledTimes(1);
});
