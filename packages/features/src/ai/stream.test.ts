import assert from "node:assert/strict";
import { test } from "node:test";
import { consumeChatStream } from "./stream";

test("stream handles split UTF-8 frames and detects interrupted responses", async () => {
  const bytes = new TextEncoder().encode(
    '{"type":"delta","text":"हाय"}\n{"type":"done","status":"completed"}\n',
  );
  const response = new Response(
    new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    }),
  );
  const events: unknown[] = [];
  await consumeChatStream(response, new AbortController().signal, (event) => events.push(event));
  assert.deepEqual(events[0], { type: "delta", text: "हाय" });
  await assert.rejects(
    consumeChatStream(
      new Response('{"type":"delta","text":"partial"}\n'),
      new AbortController().signal,
      () => {},
    ),
    /interrupted/,
  );
});

test("stop cancels a stalled body read without waiting for another provider chunk", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  const reading = consumeChatStream(response, controller.signal, () => {});
  controller.abort();
  await assert.rejects(reading, { name: "AbortError" });
  assert.equal(cancelled, true);
});

test("provider errors keep prior deltas and reject with a useful retry error", async () => {
  const events: unknown[] = [];
  await assert.rejects(
    consumeChatStream(
      new Response(
        '{"type":"delta","text":"partial"}\n{"type":"error","message":"Retry your message"}\n',
      ),
      new AbortController().signal,
      (event) => events.push(event),
    ),
    /Retry/,
  );
  assert.equal(events.length, 2);
});
