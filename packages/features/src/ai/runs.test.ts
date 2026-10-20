import { test } from "node:test";
import assert from "node:assert/strict";
import { applyChatRunEvent, type ChatRunSnapshot } from "./runs";
const initial: ChatRunSnapshot = {
  runId: "run",
  threadId: "thread",
  turnId: "turn",
  status: "running",
  seq: 3,
  text: "Saved",
};
test("snapshot replay ignores duplicates and accepts only the contiguous suffix", () => {
  const event = {
    version: 1 as const,
    runId: "run",
    seq: 4,
    event: { type: "delta" as const, text: " answer" },
  };
  const next = applyChatRunEvent(initial, event);
  assert.equal(next.text, "Saved answer");
  assert.equal(applyChatRunEvent(next, event), next);
  assert.throws(() => applyChatRunEvent(initial, { ...event, seq: 5 }), /SEQUENCE_GAP/);
  assert.throws(() => applyChatRunEvent(initial, { ...event, runId: "old" }), /MISMATCH/);
});
