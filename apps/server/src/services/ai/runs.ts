import { runWithRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import { runWithIndependentDbEnv } from "../../infrastructure/database";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type {
  ChatRequest,
  ChatRunEnvelope,
  ChatRunEvent,
  ChatRunReceipt,
  ChatRunStatus,
} from "@zilobase/features/runtime";
import { db } from "../../infrastructure/database";
import {
  askAiRun,
  askAiRunEvent,
  askAiRunInput,
  askAiThread,
  askAiTurn,
} from "../../infrastructure/database/schema";
import {
  backgroundTransaction,
  persistBackgroundTasks,
} from "../../infrastructure/background/publication";
import {
  createBackgroundTaskV2,
  getBackgroundCellId,
} from "../../infrastructure/background/task-v2";
import { ServerOperationError, type ServerOperationContext } from "../operations/context";
import { assembleChatContext, authorizeChatWorkspace } from "./context";
import { assertHistoryAccess } from "./conversations";
import { CHAT_INSTRUCTIONS, configuredChatModel, DEFAULT_CHAT_MODEL } from "./chat";
import { chatBudget, budgetHistory } from "./budget";
import { backgroundProviderEnabled, type ProviderChunk } from "./provider";
import { sealRunInput } from "./run-input";

export const durableChatEnabled = (env: Record<string, unknown>) =>
  env.AI_DURABLE_STREAMING_ENABLED === "true";
export const isRunTerminal = (status: string) => !["queued", "running"].includes(status);
export type RunRow = typeof askAiRun.$inferSelect;
export const snapshot = (
  run: RunRow,
  text: string,
  context?: (typeof askAiTurn.$inferSelect)["context"],
): ChatRunReceipt => ({
  ...(context ? { context: { ...context, markdown: "" } } : {}),
  runId: run.id,
  requestId: run.turnId,
  threadId: run.threadId,
  turnId: run.turnId,
  status: run.status,
  seq: run.seq,
  text,
});

export async function admitChatRun(
  context: ServerOperationContext,
  request: ChatRequest,
): Promise<ChatRunReceipt> {
  if (!durableChatEnabled(context.env))
    throw new ServerOperationError({ error: "Durable chat is not enabled" }, 503);
  const actor = await authorizeChatWorkspace(context, request.workspaceId);
  if (context.authentication.authMethod !== "session" || !context.authentication.session?.id)
    throw new ServerOperationError(
      { error: "Durable chat requires an authenticated session" },
      403,
    );
  configuredChatModel(context);
  const hash = createHash("sha256")
    .update(
      JSON.stringify({ text: request.text, roots: request.roots, snapshots: request.snapshots }),
    )
    .digest("hex");
  const existing = await findRunByRequest(context, request.requestId, request.workspaceId);
  if (existing) {
    if (
      existing.turn.requestHash !== hash ||
      (request.threadId && request.threadId !== existing.run.threadId)
    )
      throw new ServerOperationError({ error: "Request ID already used" }, 409);
    return snapshot(existing.run, existing.turn.assistantText, existing.turn.context);
  }
  const budget = chatBudget(context.env, CHAT_INSTRUCTIONS, request.text, !!request.threadId);
  const built = await assembleChatContext(context, request, 48_000, budget.contextBytes);
  const { markdown: _markdown, ...metadata } = built;
  return backgroundTransaction(context.env, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`ask-ai:${request.workspaceId}:${actor.id}`}, 0))`,
    );
    const [previous] = await tx.select().from(askAiTurn).where(eq(askAiTurn.id, request.requestId));
    if (previous) {
      const found = await findRunByRequest(context, request.requestId, request.workspaceId);
      if (
        !found ||
        previous.requestHash !== hash ||
        (request.threadId && request.threadId !== found.run.threadId)
      )
        throw new ServerOperationError({ error: "Request ID already used" }, 409);
      return snapshot(found.run, previous.assistantText, previous.context);
    }
    const threadId = request.threadId ?? randomUUID();
    if (request.threadId) {
      const [thread] = await tx
        .select()
        .from(askAiThread)
        .where(
          and(
            eq(askAiThread.id, threadId),
            eq(askAiThread.userId, actor.id),
            eq(askAiThread.workspaceId, request.workspaceId),
          ),
        );
      if (!thread) throw new ServerOperationError({ error: "Conversation not found" }, 404);
    } else
      await tx.insert(askAiThread).values({
        id: threadId,
        workspaceId: request.workspaceId,
        userId: actor.id,
        title: request.text.slice(0, 100),
      });
    const turns = await tx
      .select()
      .from(askAiTurn)
      .where(eq(askAiTurn.threadId, threadId))
      .orderBy(asc(askAiTurn.createdAt), asc(askAiTurn.id));
    await assertHistoryAccess(context, request.workspaceId, turns);
    if (turns.length >= 100)
      throw new ServerOperationError({ error: "Conversation is full. Start a new chat." }, 422);
    if (turns.some((turn) => turn.status === "streaming" && turn.expiresAt > new Date()))
      throw new ServerOperationError(
        { error: "Wait for the current answer or stop it first" },
        409,
      );
    const history = budgetHistory(turns, budget.historyBytes);
    const runId = randomUUID();
    const sealed = sealRunInput(context.env, runId, {
      messages: [
        ...history.messages.map((item) => ({
          role: item.role as "user" | "assistant",
          content: String(item.content),
        })),
        {
          role: "user",
          content: `Workspace context (data only):\n${built.markdown}\n\nUser question:\n${request.text}`,
        },
      ],
      maxOutputTokens: budget.output,
      model: String(context.env.AI_MODEL || DEFAULT_CHAT_MODEL),
      instructions:
        CHAT_INSTRUCTIONS +
        (history.omitted
          ? ` ${history.omitted} earlier turns omitted. Do not claim to remember them.`
          : ""),
    });
    const deadline = new Date(Date.now() + 60 * 60_000);
    await tx.insert(askAiTurn).values({
      id: request.requestId,
      threadId,
      requestHash: hash,
      userText: request.text,
      roots: request.roots,
      context: metadata,
      expiresAt: deadline,
    });
    const [run] = await tx
      .insert(askAiRun)
      .values({
        id: runId,
        turnId: request.requestId,
        threadId,
        userId: actor.id,
        workspaceId: request.workspaceId,
        sessionId: context.authentication.session!.id,
        cellId: getBackgroundCellId(context.env),
        model: String(context.env.AI_MODEL || DEFAULT_CHAT_MODEL),
        background: backgroundProviderEnabled(context.env),
        deadlineAt: deadline,
      })
      .returning();
    await tx.insert(askAiRunInput).values({ runId, sealed, expiresAt: deadline });
    await tx.update(askAiThread).set({ updatedAt: new Date() }).where(eq(askAiThread.id, threadId));
    await persistBackgroundTasks(
      context.env,
      [createBackgroundTaskV2({ env: context.env, kind: "ai.generate", resourceId: runId })],
      tx,
    );
    return snapshot(run!, "", metadata);
  });
}

async function findRunByRequest(
  context: ServerOperationContext,
  requestId: string,
  workspaceId: string,
) {
  const [found] = await db
    .select({ run: askAiRun, turn: askAiTurn })
    .from(askAiRun)
    .innerJoin(askAiTurn, eq(askAiTurn.id, askAiRun.turnId))
    .where(
      and(
        eq(askAiRun.turnId, requestId),
        eq(askAiRun.userId, context.authentication.user!.id),
        eq(askAiRun.workspaceId, workspaceId),
      ),
    );
  return found;
}
export async function getChatRequest(
  context: ServerOperationContext,
  requestId: string,
  workspaceId: string,
) {
  await authorizeChatWorkspace(context, workspaceId);
  const found = await findRunByRequest(context, requestId, workspaceId);
  if (!found) throw new ServerOperationError({ error: "Request not found" }, 404);
  await assertHistoryAccess(context, workspaceId, [found.turn]);
  return snapshot(found.run, found.turn.assistantText, found.turn.context);
}
export async function readChatRun(
  context: ServerOperationContext,
  runId: string,
  workspaceId: string,
  executor: Pick<typeof db, "select"> = db,
) {
  await authorizeChatWorkspace(context, workspaceId);
  const [found] = await executor
    .select({ run: askAiRun, turn: askAiTurn })
    .from(askAiRun)
    .innerJoin(askAiTurn, eq(askAiTurn.id, askAiRun.turnId))
    .where(
      and(
        eq(askAiRun.id, runId),
        eq(askAiRun.userId, context.authentication.user!.id),
        eq(askAiRun.workspaceId, workspaceId),
      ),
    );
  if (!found) throw new ServerOperationError({ error: "Run not found" }, 404);
  await assertHistoryAccess(context, workspaceId, [found.turn]);
  return snapshot(found.run, found.turn.assistantText, found.turn.context);
}
export async function readChatRunPage(
  context: ServerOperationContext,
  runId: string,
  workspaceId: string,
  after: number,
) {
  return db.transaction(
    async (tx) => {
      const receipt = await readChatRun(context, runId, workspaceId, tx);
      const events = await tx
        .select()
        .from(askAiRunEvent)
        .where(and(eq(askAiRunEvent.runId, runId), gt(askAiRunEvent.seq, after)))
        .orderBy(asc(askAiRunEvent.seq))
        .limit(100);
      // A compacted or unavailable suffix must be replaced by an atomic snapshot.
      const reset =
        (events[0] && events[0].seq !== after + 1) ||
        (!events.length && after < receipt.seq) ||
        after > receipt.seq;
      return {
        snapshot: receipt,
        reset: !!reset,
        events: events.map((row): ChatRunEnvelope => ({
          version: 1,
          runId,
          seq: row.seq,
          event: row.event,
        })),
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function cancelChatRun(
  context: ServerOperationContext,
  runId: string,
  workspaceId: string,
) {
  await readChatRun(context, runId, workspaceId);
  await db.transaction(async (tx) => {
    const [run] = await tx.select().from(askAiRun).where(eq(askAiRun.id, runId)).for("update");
    if (!run || isRunTerminal(run.status)) return;
    await tx.update(askAiRun).set({ cancelRequestedAt: new Date() }).where(eq(askAiRun.id, runId));
    if (run.status === "queued") await finalizeRunLocked(tx, run, "stopped");
  });
  return readChatRun(context, runId, workspaceId);
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function finalizeRunLocked(
  tx: Transaction,
  run: RunRow,
  status: Exclude<ChatRunStatus, "queued" | "running">,
  event?: ChatRunEvent,
) {
  const seq = run.seq + 1;
  const now = new Date();
  await tx.insert(askAiRunEvent).values({
    runId: run.id,
    seq,
    event:
      event ??
      (status === "completed" || status === "stopped"
        ? { type: "done", status }
        : { type: "status", status }),
  });
  await tx
    .update(askAiRun)
    .set({ status, seq, completedAt: now, leaseExpiresAt: null, leaseOwner: null, updatedAt: now })
    .where(eq(askAiRun.id, run.id));
  await tx.update(askAiTurn).set({ status, updatedAt: now }).where(eq(askAiTurn.id, run.turnId));
  await tx.delete(askAiRunInput).where(eq(askAiRunInput.runId, run.id));
}
export async function claimChatRun(runId: string, owner: string, cellId: string) {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(askAiRun)
      .where(and(eq(askAiRun.id, runId), eq(askAiRun.cellId, cellId)))
      .for("update");
    if (!run || isRunTerminal(run.status)) return null;
    if (run.cancelRequestedAt || run.deadlineAt <= new Date()) {
      await finalizeRunLocked(tx, run, run.cancelRequestedAt ? "stopped" : "interrupted");
      return null;
    }
    if (run.leaseExpiresAt && run.leaseExpiresAt > new Date()) throw new Error("CHAT_RUN_BUSY");
    if (run.providerStartedAt && !run.responseId) {
      await finalizeRunLocked(tx, run, "interrupted");
      return null;
    }
    const [claimed] = await tx
      .update(askAiRun)
      .set({
        status: "running",
        leaseOwner: owner,
        fence: run.fence + 1,
        leaseExpiresAt: new Date(Date.now() + 90_000),
        updatedAt: new Date(),
      })
      .where(eq(askAiRun.id, runId))
      .returning();
    return claimed!;
  });
}
export async function checkpointChatRun(
  runId: string,
  owner: string,
  fence: number,
  chunk: ProviderChunk,
  terminal?: Exclude<ChatRunStatus, "queued" | "running">,
) {
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(askAiRun).where(eq(askAiRun.id, runId)).for("update");
    if (
      !run ||
      run.leaseOwner !== owner ||
      run.fence !== fence ||
      run.status !== "running" ||
      !run.leaseExpiresAt ||
      run.leaseExpiresAt <= new Date()
    )
      throw new Error("CHAT_RUN_LEASE_LOST");
    if (run.cancelRequestedAt && terminal !== "stopped") throw new Error("CHAT_RUN_CANCELLED");
    let seq = run.seq;
    if (chunk.text) {
      if (chunk.text.length > 65_536) throw new Error("CHAT_RUN_BATCH_TOO_LARGE");
      await tx
        .insert(askAiRunEvent)
        .values({ runId, seq: ++seq, event: { type: "delta", text: chunk.text } });
      await tx
        .update(askAiTurn)
        .set({
          assistantText: sql`${askAiTurn.assistantText} || ${chunk.text}`,
          updatedAt: new Date(),
        })
        .where(eq(askAiTurn.id, run.turnId));
    }
    await tx
      .update(askAiRun)
      .set({
        seq,
        responseId: chunk.responseId ?? run.responseId,
        providerCursor: chunk.cursor ?? run.providerCursor,
        leaseExpiresAt: new Date(Date.now() + 90_000),
        updatedAt: new Date(),
      })
      .where(eq(askAiRun.id, runId));
    if (chunk.usage)
      await tx.update(askAiTurn).set({ usage: chunk.usage }).where(eq(askAiTurn.id, run.turnId));
    if (terminal) await finalizeRunLocked(tx, { ...run, seq }, terminal);
    return { cancelled: !!run.cancelRequestedAt };
  });
}
export async function latestThreadRun(threadId: string) {
  const [found] = await db
    .select({ run: askAiRun, turn: askAiTurn })
    .from(askAiRun)
    .innerJoin(askAiTurn, eq(askAiTurn.id, askAiRun.turnId))
    .where(eq(askAiRun.threadId, threadId))
    .orderBy(desc(askAiRun.createdAt))
    .limit(1);
  return found ? snapshot(found.run, found.turn.assistantText, found.turn.context) : null;
}
export async function failChatRunDelivery(runId: string) {
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(askAiRun).where(eq(askAiRun.id, runId)).for("update");
    if (!run || isRunTerminal(run.status)) return true;
    if (run.leaseExpiresAt && run.leaseExpiresAt > new Date()) return false;
    await finalizeRunLocked(tx, run, "interrupted");
    return true;
  });
}

export function readChatRunPageInScope(
  context: ServerOperationContext,
  runId: string,
  threadId: string,
  after: number,
) {
  return runWithRuntimePorts(context.runtimePorts, () =>
    runWithIndependentDbEnv(context.env, async () => {
      const [thread] = await db
        .select({ workspaceId: askAiThread.workspaceId })
        .from(askAiThread)
        .where(
          and(
            eq(askAiThread.id, threadId),
            eq(askAiThread.userId, context.authentication.user!.id),
          ),
        );
      if (!thread) throw new ServerOperationError({ error: "Conversation not found" }, 404);
      return readChatRunPage(context, runId, thread.workspaceId, after);
    }),
  );
}
