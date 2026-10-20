import { getDatabaseConnectionRoute } from "@zilobase/runtime-adapter/capabilities";

type Fields = {
  runId?: string;
  requestId?: string;
  model?: string;
  tool?: string;
  toolCallId?: string;
  step?: number;
  calls?: number;
  pendingReads?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  returned?: number;
  bytes?: number;
  queueWaitMs?: number;
  waitMs?: number;
  status?: number;
  outcome?: string;
  count?: number;
  totalMs?: number;
  maxMs?: number;
};
const strings = ["runId", "requestId", "model", "tool", "toolCallId", "outcome"] as const;
const numbers = [
  "step",
  "calls",
  "pendingReads",
  "inputTokens",
  "outputTokens",
  "reasoningTokens",
  "returned",
  "bytes",
  "queueWaitMs",
  "waitMs",
  "status",
  "count",
  "totalMs",
  "maxMs",
] as const;

/** Excludes prompts, source IDs/titles, tool arguments/results and error messages. */
export function createAiDiagnostics(env: Record<string, unknown>, identity: Fields = {}) {
  const enabled = env.AI_DIAGNOSTICS_ENABLED !== "false";
  const started = performance.now();
  let emitted = 0;
  const totals = new Map<string, { count: number; totalMs: number; maxMs: number }>();
  const record = (stage: string, durationMs: number) => {
    const previous = totals.get(stage) ?? { count: 0, totalMs: 0, maxMs: 0 };
    totals.set(stage, {
      count: previous.count + 1,
      totalMs: previous.totalMs + durationMs,
      maxMs: Math.max(previous.maxMs, durationMs),
    });
  };
  const safe = (fields: Fields) => {
    const result: Record<string, string | number> = {};
    for (const key of strings) {
      const value = fields[key];
      if (typeof value === "string") result[key] = value.slice(0, 128);
    }
    for (const key of numbers) {
      const value = fields[key];
      if (typeof value === "number" && Number.isFinite(value)) result[key] = Math.max(0, value);
    }
    return result;
  };
  let database = "unavailable";
  try {
    database = getDatabaseConnectionRoute(env);
  } catch {
    // Unit tests and non-database callers may have no runtime port.
  }
  const emit = (stage: string, phase: string, fields: Fields, durationMs?: number) => {
    if (!enabled || (emitted++ >= 256 && phase !== "summary" && stage !== "run")) return;
    try {
      console.info(
        JSON.stringify({
          event: "ai.diagnostic",
          version: 1,
          stage,
          phase,
          runtime: env.ZILOBASE_RUNTIME_KIND === "worker" ? "worker" : "node",
          database,
          ...safe(identity),
          ...safe(fields),
          elapsedMs: Math.round(performance.now() - started),
          ...(durationMs === undefined ? {} : { durationMs: Math.round(Math.max(0, durationMs)) }),
        }),
      );
    } catch {
      // Diagnostics must never fail a request or generation.
    }
  };
  return {
    event(stage: string, fields: Fields = {}) {
      emit(stage, "event", fields);
    },
    start(stage: string, fields: Fields = {}) {
      const at = performance.now();
      emit(stage, "start", fields);
      return (end: Fields = {}) => {
        const durationMs = performance.now() - at;
        record(stage, durationMs);
        emit(stage, "end", { ...fields, ...end }, durationMs);
      };
    },
    async measure<T>(stage: string, work: () => Promise<T>, fields: Fields = {}): Promise<T> {
      const end = this.start(stage, fields);
      try {
        const result = await work();
        end({ outcome: "ok" });
        return result;
      } catch (error) {
        end({ outcome: "error" });
        throw error;
      }
    },
    databaseTiming(stage: string) {
      return (name: string, durationMs: number) => {
        record(`${stage}.${name}`, durationMs);
        if (durationMs >= 250) emit(`${stage}.${name}`, "end", {}, durationMs);
      };
    },
    async measureQuiet<T>(stage: string, work: () => Promise<T>): Promise<T> {
      const at = performance.now();
      let outcome = "ok";
      try {
        return await work();
      } catch (error) {
        outcome = "error";
        throw error;
      } finally {
        const durationMs = performance.now() - at;
        record(stage, durationMs);
        if (durationMs >= 500 || outcome === "error") emit(stage, "end", { outcome }, durationMs);
      }
    },
    summary() {
      for (const [stage, timing] of totals) emit(stage, "summary", timing);
    },
  };
}
export type AiDiagnostics = ReturnType<typeof createAiDiagnostics>;
