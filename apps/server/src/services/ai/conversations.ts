import { latestThreadRun } from "./runs";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, lt, sql, inArray, notExists } from "drizzle-orm";
import type { BuildContextResult } from "@zilobase/page-context";
import type { ChatMessage, ChatRequest } from "@zilobase/features/runtime";
import { db } from "../../infrastructure/database";
import { askAiRun, askAiThread, askAiTurn } from "../../infrastructure/database/schema";
import { ServerOperationError, type ServerOperationContext } from "../operations/context";
import { authorizeChatWorkspace } from "./context";
import { getPageOperation } from "../pages/read/operations";
import { readDatabaseExport } from "../databases/read/operations";

type Turn = typeof askAiTurn.$inferSelect;
const owner = (workspaceId: string, userId: string) =>
  and(eq(askAiThread.workspaceId, workspaceId), eq(askAiThread.userId, userId));

async function readThread(workspaceId: string, userId: string, threadId: string) {
  const [thread] = await db
    .select()
    .from(askAiThread)
    .where(and(owner(workspaceId, userId), eq(askAiThread.id, threadId)))
    .limit(1);
  if (!thread) throw new ServerOperationError({ error: "Conversation not found" }, 404);
  return thread;
}

export async function assertHistoryAccess(
  context: ServerOperationContext,
  workspaceId: string,
  turns: Turn[],
) {
  const scoped = { ...context, pinnedWorkspaceId: workspaceId };
  const checked = new Set<string>();
  for (const turn of turns)
    for (const entry of turn.context.manifest) {
      if (entry.type === "record" || checked.has(entry.key)) continue;
      checked.add(entry.key);
      try {
        if (entry.type === "page") {
          const result = await getPageOperation(scoped, { pageId: entry.id });
          if (result.viewerType === "public" || result.page.deletedAt)
            throw new Error("Unavailable");
        } else {
          if (!entry.databaseId) throw new Error("Unavailable");
          const result = await readDatabaseExport(scoped, {
            databaseId: entry.databaseId,
            dataSourceId: entry.type === "source" ? entry.id : undefined,
            rowLimit: 1,
          });
          if (
            result.viewerType === "public" ||
            (entry.type === "source" && result.activeDataSource?.id !== entry.id)
          )
            throw new Error("Unavailable");
        }
      } catch {
        throw new ServerOperationError(
          {
            error:
              "A source used in this conversation is no longer accessible. Start a new chat with your current attachments.",
          },
          409,
        );
      }
    }
}

function historicalContext(turn: Turn): BuildContextResult {
  return {
    ...turn.context,
    markdown: "",
    omissions: [
      ...turn.context.omissions,
      "Historical source content is not retained. These are the source IDs and coverage recorded for this answer.",
    ],
  };
}

function messagesFromTurns(turns: Turn[]): ChatMessage[] {
  return turns.flatMap((turn) => [
    { id: `${turn.id}:user`, role: "user", text: turn.userText, roots: turn.roots } as ChatMessage,
    {
      id: `${turn.id}:assistant`,
      role: "assistant",
      text: turn.assistantText,
      roots: turn.roots,
      context: historicalContext(turn),
      status: turn.status as ChatMessage["status"],
    } as ChatMessage,
  ]);
}

export async function listChatThreads(context: ServerOperationContext, workspaceId: string) {
  const user = await authorizeChatWorkspace(context, workspaceId);
  const threads = await db
    .select()
    .from(askAiThread)
    .where(owner(workspaceId, user.id))
    .orderBy(desc(askAiThread.updatedAt))
    .limit(100);
  const active = threads.length
    ? await db
        .select({ threadId: askAiRun.threadId, status: askAiRun.status })
        .from(askAiRun)
        .where(
          and(
            inArray(
              askAiRun.threadId,
              threads.map((thread) => thread.id),
            ),
            inArray(askAiRun.status, ["queued", "running"]),
          ),
        )
    : [];
  return threads.map((thread) => ({
    ...thread,
    status: active.find((run) => run.threadId === thread.id)?.status,
  }));
}

export async function getChatThread(
  context: ServerOperationContext,
  workspaceId: string,
  threadId: string,
) {
  const user = await authorizeChatWorkspace(context, workspaceId);
  const thread = await readThread(workspaceId, user.id, threadId);
  await db
    .update(askAiTurn)
    .set({ status: "interrupted", updatedAt: new Date() })
    .where(
      and(
        eq(askAiTurn.threadId, thread.id),
        eq(askAiTurn.status, "streaming"),
        lt(askAiTurn.expiresAt, new Date()),
        notExists(
          db.select({ id: askAiRun.id }).from(askAiRun).where(eq(askAiRun.turnId, askAiTurn.id)),
        ),
      ),
    );
  const turns = await db
    .select()
    .from(askAiTurn)
    .where(eq(askAiTurn.threadId, thread.id))
    .orderBy(asc(askAiTurn.createdAt), asc(askAiTurn.id));
  await assertHistoryAccess(context, workspaceId, turns);
  return {
    thread,
    messages: messagesFromTurns(turns),
    roots: turns.at(-1)?.roots ?? [],
    run: await latestThreadRun(threadId),
  };
}

export async function deleteChatThread(
  context: ServerOperationContext,
  workspaceId: string,
  threadId: string,
) {
  const user = await authorizeChatWorkspace(context, workspaceId);
  await readThread(workspaceId, user.id, threadId);
  await db
    .delete(askAiThread)
    .where(and(owner(workspaceId, user.id), eq(askAiThread.id, threadId)));
  return { success: true };
}

export async function beginChatTurn(
  context: ServerOperationContext,
  request: ChatRequest,
  built: BuildContextResult,
) {
  const user = await authorizeChatWorkspace(context, request.workspaceId);
  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({ text: request.text, roots: request.roots, snapshots: request.snapshots }),
    )
    .digest("hex");
  const { markdown: _markdown, ...metadata } = built;
  const claimed = await db.transaction(async (tx) => {
    // Serialize retries and concurrent turns for this account/workspace across server instances.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`ask-ai:${request.workspaceId}:${user.id}`}, 0))`,
    );
    const [previous] = await tx
      .select({ turn: askAiTurn, thread: askAiThread })
      .from(askAiTurn)
      .innerJoin(askAiThread, eq(askAiTurn.threadId, askAiThread.id))
      .where(eq(askAiTurn.id, request.requestId))
      .limit(1);
    if (previous) {
      if (
        previous.thread.userId !== user.id ||
        previous.thread.workspaceId !== request.workspaceId ||
        previous.turn.requestHash !== requestHash ||
        (request.threadId && request.threadId !== previous.thread.id)
      )
        throw new ServerOperationError({ error: "Request ID already used" }, 409);
      if (previous.turn.status === "streaming" && previous.turn.expiresAt > new Date())
        throw new ServerOperationError(
          { error: "This answer is still being generated. Reopen the conversation shortly." },
          409,
        );
      const turn =
        previous.turn.status === "streaming"
          ? { ...previous.turn, status: "interrupted" }
          : previous.turn;
      return { threadId: previous.thread.id, turns: [turn], replay: turn };
    }
    const threadId = request.threadId ?? randomUUID();
    if (request.threadId) {
      const [thread] = await tx
        .select()
        .from(askAiThread)
        .where(and(owner(request.workspaceId, user.id), eq(askAiThread.id, threadId)))
        .limit(1);
      if (!thread) throw new ServerOperationError({ error: "Conversation not found" }, 404);
    } else
      await tx.insert(askAiThread).values({
        id: threadId,
        workspaceId: request.workspaceId,
        userId: user.id,
        title: request.text.slice(0, 100),
      });
    const turns = await tx
      .select()
      .from(askAiTurn)
      .where(eq(askAiTurn.threadId, threadId))
      .orderBy(asc(askAiTurn.createdAt), asc(askAiTurn.id));
    if (turns.length >= 100)
      throw new ServerOperationError(
        { error: "This conversation is full. Start a new chat." },
        422,
      );
    if (turns.some((turn) => turn.status === "streaming" && turn.expiresAt > new Date()))
      throw new ServerOperationError(
        { error: "Wait for the current answer or stop it first" },
        409,
      );
    await tx
      .update(askAiTurn)
      .set({ status: "interrupted", updatedAt: new Date() })
      .where(and(eq(askAiTurn.threadId, threadId), eq(askAiTurn.status, "streaming")));
    await tx.insert(askAiTurn).values({
      id: request.requestId,
      threadId,
      requestHash,
      userText: request.text,
      roots: request.roots,
      context: metadata,
      expiresAt: new Date(Date.now() + 200_000),
    });
    await tx.update(askAiThread).set({ updatedAt: new Date() }).where(eq(askAiThread.id, threadId));
    return { threadId, turns, replay: null };
  });
  try {
    await assertHistoryAccess(context, request.workspaceId, claimed.turns);
  } catch (error) {
    if (!claimed.replay) await finishChatTurn(request.requestId, "", "failed");
    throw error;
  }
  return claimed;
}

export async function finishChatTurn(
  id: string,
  text: string,
  status: "completed" | "stopped" | "failed" | "interrupted",
  usage?: { inputTokens?: number; outputTokens?: number },
  context?: Omit<BuildContextResult, "markdown">,
) {
  await db
    .update(askAiTurn)
    .set({
      assistantText: text,
      status,
      usage,
      ...(context ? { context } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(askAiTurn.id, id), eq(askAiTurn.status, "streaming")));
}
