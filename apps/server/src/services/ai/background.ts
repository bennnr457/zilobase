import { and, eq, lt, inArray } from "drizzle-orm";
import { getRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import { db, runWithIndependentDbEnv } from "../../infrastructure/database";
import {
  askAiRun,
  askAiRunEvent,
  askAiRunInput,
  session,
  user,
} from "../../infrastructure/database/schema";
import { getBackgroundCellId } from "../../infrastructure/background/contracts";
import { communityAppPolicy, managedAppPolicy } from "../../shared/config/app-policy";
import type { RuntimeEnv } from "../../shared/config/config";
import type { ServerOperationContext } from "../operations/context";
import { cancelProviderResponse, generateChatOutput, type ProviderChunk } from "./provider";
import {
  claimChatRun,
  checkpointChatRun,
  failChatRunDelivery,
  isRunTerminal,
  readChatRun,
} from "./runs";
import { openRunInput } from "./run-input";

export async function processAiGeneration(
  env: RuntimeEnv,
  input: { runId: string; workerId: string; signal?: AbortSignal },
  provider = generateChatOutput,
) {
  const scope = <T>(work: () => Promise<T>) => runWithIndependentDbEnv(env, work);
  let run;
  try {
    run = await scope(() => claimChatRun(input.runId, input.workerId, getBackgroundCellId(env)));
  } catch (error) {
    if (error instanceof Error && error.message === "CHAT_RUN_BUSY")
      return {
        outcome: "retry" as const,
        availableAt: new Date(Date.now() + 90_000).toISOString(),
      };
    throw error;
  }
  if (!run) return { outcome: "completed" as const };
  const controller = new AbortController();
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(Math.min(180_000, Math.max(1, run.deadlineAt.getTime() - Date.now()))),
    ...(input.signal ? [input.signal] : []),
  ]);
  let context: ServerOperationContext | undefined;
  let buffer = "";
  let cursor: ProviderChunk = { responseId: run.responseId, cursor: run.providerCursor };
  let savedAt = Date.now();
  let finished = false;
  let stopped = false;
  let authorizedAt = 0;
  let control: Promise<void> | undefined;
  let flushTimer: ReturnType<typeof setInterval> | undefined;
  let writing: Promise<unknown> = Promise.resolve();
  const flush = async (complete = false) => {
    const chunk = { ...cursor, text: buffer };
    buffer = "";
    savedAt = Date.now();
    writing = writing.then(() =>
      scope(() =>
        checkpointChatRun(
          run.id,
          input.workerId,
          run.fence,
          chunk,
          complete ? "completed" : undefined,
        ),
      ),
    );
    await writing;
  };
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    context = await scope(async () => {
      const [actor] = await db.select().from(user).where(eq(user.id, run.userId));
      const [login] = await db
        .select()
        .from(session)
        .where(and(eq(session.id, run.sessionId), eq(session.userId, run.userId)));
      if (!actor || !login || login.expiresAt <= new Date())
        throw new Error("CHAT_SESSION_REVOKED");
      return {
        env: {
          ...env,
          AI_MODEL: run.model,
          AI_PROVIDER_BACKGROUND_ENABLED: String(run.background),
        },
        runtimePorts: getRuntimePorts(),
        policy: env.ZILOBASE_RUNTIME_KIND === "worker" ? managedAppPolicy : communityAppPolicy,
        editionExtension: null,
        authentication: {
          user: actor,
          session: login,
          authMethod: "session",
          apiKey: null,
          oauthScopes: null,
        },
        activeWorkspaceId: run.workspaceId,
        pinnedWorkspaceId: run.workspaceId,
        requestId: run.turnId,
      };
    });
    const activeContext = context;
    await scope(() => readChatRun(activeContext, run.id, run.workspaceId));
    const [sealed] = await scope(() =>
      db.select().from(askAiRunInput).where(eq(askAiRunInput.runId, run.id)),
    );
    if (!sealed || sealed.expiresAt <= new Date()) throw new Error("CHAT_INPUT_EXPIRED");
    const payload = openRunInput(env, run.id, sealed.sealed);
    await scope(async () => {
      await db
        .update(askAiRun)
        .set({ providerStartedAt: new Date() })
        .where(
          and(
            eq(askAiRun.id, run.id),
            eq(askAiRun.leaseOwner, input.workerId),
            eq(askAiRun.fence, run.fence),
          ),
        );
    });
    const check = async () => {
      await scope(async () => {
        const [state] = await db.select().from(askAiRun).where(eq(askAiRun.id, run.id));
        if (
          !state ||
          state.leaseOwner !== input.workerId ||
          state.fence !== run.fence ||
          isRunTerminal(state.status)
        )
          throw new Error("CHAT_RUN_LEASE_LOST");
        if (state.cancelRequestedAt) {
          stopped = true;
          throw new Error("CHAT_RUN_CANCELLED");
        }
        if (Date.now() - authorizedAt > 5000) {
          const [login] = await db.select().from(session).where(eq(session.id, run.sessionId));
          if (!login || login.expiresAt <= new Date()) throw new Error("CHAT_SESSION_REVOKED");
          await readChatRun(activeContext, run.id, run.workspaceId);
          authorizedAt = Date.now();
        }
        await checkpointChatRun(run.id, input.workerId, run.fence, {});
      });
    };
    heartbeat = setInterval(() => {
      if (control) return;
      control = check()
        .catch((error) => {
          controller.abort(error);
        })
        .finally(() => {
          control = undefined;
        });
    }, 1000);
    flushTimer = setInterval(() => {
      if (buffer && Date.now() - savedAt >= 200)
        void flush().catch((error) => controller.abort(error));
    }, 200);
    for await (const chunk of provider(activeContext, payload, signal, cursor)) {
      signal.throwIfAborted();
      buffer += chunk.text ?? "";
      const newResponse = chunk.responseId && !cursor.responseId;
      cursor = { ...cursor, ...chunk, text: undefined };
      if (newResponse || buffer.length >= 4096 || Date.now() - savedAt >= 200 || chunk.completed) {
        await flush(!!chunk.completed);
      }
      if (chunk.completed) {
        finished = true;
        break;
      }
    }
    if (!finished) throw new Error("CHAT_PROVIDER_INTERRUPTED");
  } catch (error) {
    if (input.signal?.aborted) throw error;
    if (context && cursor.responseId && signal.aborted)
      await cancelProviderResponse(context, cursor.responseId).catch(() => {});
    // A saved response can be reattached by a replacement worker. Never start another provider call for this attempt.
    if (!signal.aborted && cursor.responseId && !stopped && run.deadlineAt > new Date()) {
      await scope(async () => {
        await db
          .update(askAiRun)
          .set({ leaseExpiresAt: new Date() })
          .where(
            and(
              eq(askAiRun.id, run.id),
              eq(askAiRun.leaseOwner, input.workerId),
              eq(askAiRun.fence, run.fence),
            ),
          );
      });
      throw error;
    }
    await scope(() =>
      checkpointChatRun(
        run.id,
        input.workerId,
        run.fence,
        { ...cursor, text: buffer },
        stopped ? "stopped" : signal.aborted ? "interrupted" : "failed",
      ),
    ).catch(async (cause) => {
      if (
        !(cause instanceof Error) ||
        !["CHAT_RUN_LEASE_LOST", "CHAT_RUN_CANCELLED"].includes(cause.message)
      )
        throw cause;
    });
  } finally {
    if (flushTimer) clearInterval(flushTimer);
    if (heartbeat) clearInterval(heartbeat);
    await writing.catch(() => {});
    await control;
  }
  return { outcome: "completed" as const };
}

/** A bounded sweep closes abandoned input and removes replay data after history is durable. */
export async function maintainAiRuns(env: RuntimeEnv) {
  const rows = await db
    .select({ id: askAiRun.id })
    .from(askAiRun)
    .where(
      and(
        eq(askAiRun.cellId, getBackgroundCellId(env)),
        inArray(askAiRun.status, ["queued", "running"]),
        lt(askAiRun.deadlineAt, new Date()),
      ),
    )
    .limit(100);
  for (const row of rows) await failChatRunDelivery(row.id);
  const expired = await db
    .select({ id: askAiRun.id })
    .from(askAiRun)
    .where(
      and(
        eq(askAiRun.cellId, getBackgroundCellId(env)),
        inArray(askAiRun.status, ["completed", "stopped", "failed", "interrupted"]),
        lt(askAiRun.completedAt, new Date(Date.now() - 86_400_000)),
      ),
    )
    .limit(100);
  for (const row of expired) await db.delete(askAiRunEvent).where(eq(askAiRunEvent.runId, row.id));
}
