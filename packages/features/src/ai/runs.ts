import { z } from "zod";
import type { BuildContextResult } from "@zilobase/page-context";
import type { ChatEvent } from "./contracts";
import { chatReadProgressEventSchema, type ChatReadProgress } from "./tools";

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
  context?: BuildContextResult;
  progress?: ChatReadProgress;
};
export type ChatRunReceipt = ChatRunSnapshot & { requestId: string; context?: BuildContextResult };
export type ChatRunEvent =
  | Exclude<ChatEvent, { type: "debug" }>
  | { type: "status"; status: ChatRunStatus };
export type ChatRunEnvelope = { version: 1; runId: string; seq: number; event: ChatRunEvent };
export const terminalChatRun = (
  status: ChatRunStatus,
): status is Exclude<ChatRunStatus, "queued" | "running"> =>
  !["queued", "running"].includes(status);

const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), status: chatRunStatusSchema }),
  z.object({ type: z.literal("delta"), text: z.string().max(65_536) }),
  z.object({ type: z.literal("replace-text"), text: z.string().max(524_288) }),
  chatReadProgressEventSchema,
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
    text:
      event.type === "delta"
        ? snapshot.text + event.text
        : event.type === "replace-text"
          ? event.text
          : snapshot.text,
    ...(event.type === "read-progress" ? { context: event.context, progress: event.progress } : {}),
    status:
      event.type === "status" || event.type === "done"
        ? event.status
        : event.type === "error"
          ? "failed"
          : snapshot.status,
  };
}
