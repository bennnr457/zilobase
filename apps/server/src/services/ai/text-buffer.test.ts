import { expect, test, vi } from "vitest";
import { createChatTextBuffer } from "./text-buffer";
import type { ProviderChunk } from "./provider";

test("slow persistence coalesces tiny tokens without blocking model consumption or queuing writes", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const committed: Array<{ chunk: ProviderChunk; complete: boolean }> = [];
  const persist = vi.fn(async (chunk: ProviderChunk, complete: boolean) => {
    if (!committed.length) await gate;
    committed.push({ chunk, complete });
  });
  const buffer = createChatTextBuffer(persist);
  buffer.append({ text: "First " });
  const first = buffer.start();
  for (const letter of "a streamed answer with many tiny tokens") {
    buffer.append({ text: letter });
    expect(buffer.start()).toBe(first);
  }
  const done = buffer.drain(true);
  await Promise.resolve();
  expect(persist).toHaveBeenCalledOnce();
  release();
  await done;
  expect(committed).toHaveLength(2);
  expect(committed.map(({ chunk }) => chunk.text).join("")).toBe(
    "First a streamed answer with many tiny tokens",
  );
  expect(committed.map(({ complete }) => complete)).toEqual([false, true]);
});

test("cursor advances only with the corresponding text batch and final usage", async () => {
  const committed: ProviderChunk[] = [];
  const buffer = createChatTextBuffer(async (chunk) => {
    committed.push(chunk);
  });
  buffer.append({ responseId: "response", cursor: 1, text: "One" });
  await buffer.drain();
  buffer.append({ cursor: 2, text: "Two", usage: { outputTokens: 2 } });
  await buffer.drain(true);
  expect(committed).toEqual([
    { responseId: "response", cursor: 1, text: "One", usage: undefined },
    { responseId: "response", cursor: 2, text: "Two", usage: { outputTokens: 2 } },
  ]);
});

test("cancellation restores an uncommitted batch ahead of subsequent text", async () => {
  let reject!: (error: Error) => void;
  const buffer = createChatTextBuffer(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      }),
  );
  buffer.append({ text: "before" });
  const flushing = buffer.start();
  buffer.append({ text: "after" });
  await Promise.resolve();
  reject(new Error("CHAT_RUN_CANCELLED"));
  await expect(flushing).rejects.toThrow("CHAT_RUN_CANCELLED");
  expect(buffer.pending().text).toBe("beforeafter");
});

test("bounded buffering provides backpressure and skips empty persistence", async () => {
  const persist = vi.fn(async () => {});
  const buffer = createChatTextBuffer(persist);
  await buffer.drain();
  expect(persist).not.toHaveBeenCalled();
  buffer.append({ text: "x".repeat(65_536) });
  expect(() => buffer.append({ text: "x" })).toThrow("CHAT_RUN_BATCH_TOO_LARGE");
  await buffer.drain();
  buffer.append({ text: "x" });
  await buffer.drain(true);
  expect(persist).toHaveBeenCalledTimes(2);
});
