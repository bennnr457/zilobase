import { test } from "node:test";
import assert from "node:assert/strict";
import { applyChatRunEvent, chatRunEnvelopeSchema, type ChatRunSnapshot } from "./runs";
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
test("tool progress and replacement text replay atomically without exposing raw source content", () => {
  const context = {
    version: 1 as const,
    status: "partial" as const,
    markdown: "",
    charCount: 0,
    manifest: [],
    omissions: ["More pages available"],
    trimmedAttachmentIds: [],
  };
  const event = chatRunEnvelopeSchema.parse({
    version: 1,
    runId: "00000000-0000-4000-8000-000000000001",
    seq: 4,
    event: {
      type: "read-progress",
      context,
      progress: {
        activities: [
          {
            id: "read",
            name: "read_page",
            label: "Reading page",
            source: { type: "page", id: "selected-page" },
            status: "completed",
            returned: 10,
            hasMore: true,
          },
        ],
        canContinue: true,
      },
    },
  });
  const snapshot = { ...initial, runId: event.runId };
  const next = applyChatRunEvent(snapshot, event);
  assert.equal(next.progress?.canContinue, true);
  assert.equal(next.context?.status, "partial");
  assert.deepEqual(next.progress?.activities[0]?.source, { type: "page", id: "selected-page" });
  assert.equal(
    applyChatRunEvent(next, {
      ...event,
      seq: 5,
      event: { type: "replace-text", text: "Committed text" },
    }).text,
    "Committed text",
  );
  assert.throws(() =>
    chatRunEnvelopeSchema.parse({
      ...event,
      event: { ...event.event, context: { ...context, markdown: "private page body" } },
    }),
  );
});
