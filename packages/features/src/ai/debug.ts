import { z } from "zod";
import type { ChatRunStatus } from "./runs";

export type ChatDebugEvent = {
  id: number;
  at: string;
  step: number;
  type:
    | "run.started"
    | "model.request"
    | "model.response"
    | "tool.call"
    | "tool.result"
    | "step.completed"
    | "run.completed"
    | "run.error";
  toolCallId?: string;
  tool?: string;
  durationMs?: number;
  payload: string;
  truncated?: boolean;
};

export type ChatDebugLog = {
  events: ChatDebugEvent[];
  bytes: number;
  omitted: number;
};

export type ChatRunDebug = {
  runId: string;
  status: ChatRunStatus;
  model: string | null;
  expiresAt: string | null;
  available: boolean;
  events: ChatDebugEvent[];
  omitted: number;
};

export const chatDebugStreamEventSchema = z.object({
  type: z.literal("debug"),
  events: z
    .array(
      z.object({
        id: z.number().int().positive(),
        at: z.iso.datetime(),
        step: z.number().int().nonnegative(),
        type: z.enum([
          "run.started",
          "model.request",
          "model.response",
          "tool.call",
          "tool.result",
          "step.completed",
          "run.completed",
          "run.error",
        ]),
        tool: z.string().max(128).optional(),
        toolCallId: z.string().max(128).optional(),
        durationMs: z.number().nonnegative().optional(),
        payload: z.string().max(32768),
        truncated: z.boolean().optional(),
      }),
    )
    .max(1000),
  omitted: z.number().int().nonnegative(),
});
