import assert from "node:assert/strict";
import { test } from "node:test";
import { TestQueryClient } from "../data/testing";
import { sharedClient } from "../data/client";
import {
  followChatRun,
  recoverChatSubmission,
  submitChatRun,
  type ChatSubmission,
  type DurableChatContext,
} from "./durable";
import type { ChatRunReceipt } from "./runs";
import type { ChatRequest } from "./contracts";
const initial: ChatRunReceipt = {
  requestId: "request",
  runId: "00000000-0000-4000-8000-000000000001",
  threadId: "thread",
  turnId: "turn",
  status: "running",
  seq: 3,
  text: "Saved",
};
const envelope = (seq: number, event: unknown) =>
  JSON.stringify({ version: 1, runId: "00000000-0000-4000-8000-000000000001", seq, event }) + "\n";
function fixture() {
  const queryClient = new TestQueryClient({ defaultOptions: { queries: { retry: false } } });
  const saved = new Map<string, ChatSubmission>();
  const calls: string[] = [];
  const context: DurableChatContext = {
    queryClient,
    chatReceipts: {
      load: async (key) => saved.get(key) ?? null,
      clear: async (key, requestId) => {
        if (saved.get(key)?.requestId === requestId) saved.delete(key);
      },
      write: async (key, value) => {
        if (value) saved.set(key, value);
        else saved.delete(key);
      },
    },
    apiFetch: async <T>(path: string) => {
      calls.push(path);
      return initial as T;
    },
  };
  return { context, saved, calls };
}
test("persist the minimal submission before POST and recover a lost response without another POST", async () => {
  const { context, saved, calls } = fixture();
  context.apiFetch = async () => {
    assert.equal(saved.size, 1);
    throw new Error("Lost response");
  };
  await assert.rejects(
    submitChatRun(
      context,
      { requestId: "request", workspaceId: "workspace" } as ChatRequest,
      new AbortController().signal,
    ),
    /Lost/,
  );
  assert.deepEqual([...saved.values()][0], {
    requestId: "request",
    workspaceId: "workspace",
    createdAt: [...saved.values()][0].createdAt,
  });
  context.apiFetch = async <T>(path: string) => {
    calls.push(path);
    return initial as T;
  };
  assert.equal(
    (await recoverChatSubmission(context, "workspace"))?.runId,
    "00000000-0000-4000-8000-000000000001",
  );
  assert.deepEqual(calls, ["/ai/requests/request?workspaceId=workspace"]);
  assert.equal(await recoverChatSubmission(context, "different-workspace"), null);
  context.queryClient.clear();
});
test("reload resumes from its snapshot cursor and ignores replay duplicates", async () => {
  const { context, calls } = fixture();
  const urls: string[] = [];
  context.streamFetch = async (path) => {
    urls.push(path);
    return new Response(
      envelope(3, { type: "delta", text: "duplicate" }) +
        envelope(4, { type: "delta", text: " answer" }) +
        envelope(5, { type: "status", status: "completed" }),
    );
  };
  const texts: string[] = [];
  const run = await followChatRun(
    context,
    initial,
    "workspace",
    new AbortController().signal,
    (run) => texts.push(run.text),
  );
  assert.equal(run.text, "Saved answer");
  assert.equal(
    urls[0],
    "/ai/runs/00000000-0000-4000-8000-000000000001/events?workspaceId=workspace&after=3",
  );
  assert.equal(texts.includes("Savedduplicate"), false);
  assert.equal(calls.length, 0);
  context.queryClient.clear();
});
test("subscriber abort cancels only the reader, with no producer cancellation", async () => {
  const { context, calls } = fixture();
  let cancelled = false;
  context.streamFetch = async () =>
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    );
  const controller = new AbortController();
  const following = followChatRun(context, initial, "workspace", controller.signal, () => {});
  await Promise.resolve();
  controller.abort();
  await assert.rejects(following, { name: "AbortError" });
  assert.equal(cancelled, true);
  assert.deepEqual(calls, []);
  context.queryClient.clear();
});
test("identity expiration cannot publish late stream results", async () => {
  const { context } = fixture();
  let release!: (response: Response) => void;
  context.streamFetch = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  let publications = 0;
  const following = followChatRun(
    context,
    initial,
    "workspace",
    new AbortController().signal,
    () => {
      publications++;
    },
  );
  sharedClient(context.queryClient).clear();
  release(new Response(envelope(4, { type: "delta", text: "private" })));
  await assert.rejects(following, /expired identity/);
  assert.equal(publications, 1);
  context.queryClient.clear();
});
test("compacted journals replace partial text with the authoritative snapshot", async () => {
  const { context } = fixture();
  context.streamFetch = async () => new Response('{"type":"snapshot"}\n');
  context.apiFetch = async <T>() =>
    ({ ...initial, seq: 9, text: "Complete answer", status: "completed" }) as T;
  const run = await followChatRun(
    context,
    initial,
    "workspace",
    new AbortController().signal,
    () => {},
  );
  assert.equal(run.text, "Complete answer");
  context.queryClient.clear();
});

test("an older terminal run cannot erase the receipt for a newer submission", async () => {
  const { context, saved } = fixture();
  await submitChatRun(
    context,
    { requestId: "newer", workspaceId: "workspace" } as ChatRequest,
    new AbortController().signal,
  );
  context.streamFetch = async () => new Response();
  await followChatRun(
    context,
    { ...initial, status: "completed" },
    "workspace",
    new AbortController().signal,
    () => {},
  );
  assert.equal([...saved.values()][0]?.requestId, "newer");
  context.queryClient.clear();
});
