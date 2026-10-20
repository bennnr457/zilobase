import type { ChatRunReceipt, ChatRunStatus } from "./runs";
import { z } from "zod";
import type { BuildContextResult, ResourceRef } from "@zilobase/page-context";
import { parsePageDocument } from "./context";
import type { ChatReadProgress } from "./tools";

export const resourceRefSchema = z.object({
  type: z.enum(["page", "database"]),
  id: z.string().min(1).max(128),
});
export const chatRequestSchema = z
  .object({
    workspaceId: z.string().min(1).max(128),
    requestId: z.uuid(),
    threadId: z.uuid().optional(),
    continueFromRunId: z.uuid().optional(),
    text: z.string().trim().min(1).max(20_000),
    roots: z.array(resourceRefSchema).max(20),
    snapshots: z
      .array(
        z.object({
          pageId: z.string().min(1).max(128),
          capturedAt: z.iso.datetime(),
          content: z.unknown().superRefine((value, ctx) => {
            try {
              parsePageDocument(value);
            } catch {
              ctx.addIssue({ code: "custom", message: "Invalid or oversized page document" });
            }
          }),
        }),
      )
      .max(0, "Editor snapshots are not accepted. Mention a saved source instead.")
      .default([]),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          text: z.string().max(32_000),
          roots: z.array(resourceRefSchema).max(20),
        }),
      )
      .max(0, "Conversation history is owned by the server")
      .default([]),
  })
  .strict();
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatEvent =
  | { type: "snapshot"; run: ChatRunReceipt }
  | { type: "context"; context: BuildContextResult; threadId?: string }
  | { type: "delta"; text: string }
  | { type: "replace-text"; text: string }
  | { type: "read-progress"; context: BuildContextResult; progress: ChatReadProgress }
  | { type: "done"; status: "completed" | "stopped"; inputTokens?: number; outputTokens?: number }
  | { type: "error"; message: string };
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  roots?: ResourceRef[];
  context?: BuildContextResult;
  progress?: ChatReadProgress;
  runId?: string;
  status?: "completed" | "stopped" | "failed" | "interrupted" | "streaming";
};

export type ChatThread = {
  id: string;
  workspaceId: string;
  title: string;
  updatedAt: string;
  status?: ChatRunStatus;
};
export type ChatThreadDetail = {
  run?: ChatRunReceipt | null;
  thread: ChatThread;
  messages: ChatMessage[];
  roots: ResourceRef[];
};
