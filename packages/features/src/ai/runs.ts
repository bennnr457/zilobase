import { z } from "zod";
import type { ChatEvent } from "./contracts";

export const chatRunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "stopped",
  "failed",
  "interrupted",
]);
export type ChatRunStatus = z.infer<typeof chatRunStatusSchema>;
export type ChatRunSnapshot = {
  runId: string;
  threadId: string;
  turnId: string;
  status: ChatRunStatus;
  seq: number;
  text: string;
};
export type ChatRunReceipt = ChatRunSnapshot & { requestId: string };
export type ChatRunEvent = ChatEvent | { type: "status"; status: ChatRunStatus };
export type ChatRunEnvelope = { version: 1; runId: string; seq: number; event: ChatRunEvent };
export const terminalChatRun = (status: ChatRunStatus) => !["queued", "running"].includes(status);

const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), status: chatRunStatusSchema }),
  z.object({ type: z.literal("delta"), text: z.string().max(65_536) }),
  z.object({
    type: z.literal("done"),
    status: z.enum(["completed", "stopped"]),
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
  }),
  z.object({ type: z.literal("error"), message: z.string().max(4096) }),
]);
export const chatRunEnvelopeSchema = z.object({
  version: z.literal(1),
  runId: z.uuid(),
  seq: z.number().int().positive(),
  event: eventSchema,
});

/** Apply only a contiguous suffix after the server's atomic snapshot. */
export function applyChatRunEvent(
  snapshot: ChatRunSnapshot,
  envelope: ChatRunEnvelope,
): ChatRunSnapshot {
  if (envelope.runId !== snapshot.runId) throw new Error("CHAT_RUN_MISMATCH");
  if (envelope.seq <= snapshot.seq) return snapshot;
  if (envelope.seq !== snapshot.seq + 1) throw new Error("CHAT_RUN_SEQUENCE_GAP");
  const event = envelope.event;
  return {
    ...snapshot,
    seq: envelope.seq,
    text: event.type === "delta" ? snapshot.text + event.text : snapshot.text,
    status:
      event.type === "status" || event.type === "done"
        ? event.status
        : event.type === "error"
          ? "failed"
          : snapshot.status,
  };
}
