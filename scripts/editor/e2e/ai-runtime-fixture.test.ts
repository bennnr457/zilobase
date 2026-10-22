import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { chatRunEnvelopeSchema, type ChatEvent, type ChatRunReceipt } from "@zilobase/features/ai";
import { chatReadProgressEventSchema } from "../../../packages/features/src/ai/tools";
import { createAiRuntimeFixture } from "./ai-runtime-fixture";

function fixture(t: TestContext, query = "") {
  const storage = new Map<string, string>();
  for (const [name, value] of Object.entries({
    location: new URL(`http://localhost/?${query}`),
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  return {
    ...createAiRuntimeFixture([
      { id: "main", name: "Main", workspaceId: "workspace" },
      { id: "child", name: "Child", workspaceId: "workspace" },
    ]),
    saved: () => JSON.parse(storage.get("ai-fixture-threads")!)[0],
  };
}

const request = (text = "Read [[page:main]]") => ({
  body: JSON.stringify({ workspaceId: "workspace", requestId: crypto.randomUUID(), text }),
});
const events = async (response: Response): Promise<ChatEvent[]> =>
  (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

test("streaming starts without evidence; reading an embedded reference does not read its records", async (t) => {
  const runtime = fixture(t);
  runtime.controls.holdReads = true;
  runtime.controls.holdFirstToken = true;
  const response = await runtime.streamFetch("/ai/chat", request());
  const savedBeforeRead = runtime.saved().messages.at(-1);
  assert.deepEqual(savedBeforeRead.context.manifest, []);
  assert.equal(savedBeforeRead.context.markdown, "");
  assert.equal(savedBeforeRead.context.charCount, 0);

  runtime.controls.releaseReads();
  const savedAfterRead = runtime.saved().messages.at(-1);
  assert.deepEqual(
    savedAfterRead.context.manifest.map((entry: { key: string }) => entry.key),
    ["page:main"],
  );
  assert.equal(savedAfterRead.text, "");
  assert.equal(savedAfterRead.progress.activities[0].status, "completed");
  runtime.controls.releaseFirstToken();

  const output = await events(response);
  const initial = output.find((event) => event.type === "context")!;
  assert.equal(initial.type, "context");
  if (initial.type === "context") assert.deepEqual(initial.context.manifest, []);
  const progress = output.filter((event) => event.type === "read-progress");
  progress.forEach((event) => chatReadProgressEventSchema.parse(event));
  assert.deepEqual(
    progress.map((event) => event.context.manifest.length),
    [0, 1],
  );
  const debug = output.filter((event) => event.type === "debug").flatMap((event) => event.events);
  assert.match(debug.at(-1)!.payload!, /Saved server plan/);
  assert.match(debug.at(-1)!.payload!, /Database \(database\)/);
});

test("record evidence is added by a separate query after the page read", async (t) => {
  const runtime = fixture(t);
  const output = await events(
    await runtime.streamFetch("/ai/chat", request("Read [[page:main]] and [[database:database]]")),
  );
  const progress = output.filter((event) => event.type === "read-progress");
  progress.forEach((event) => chatReadProgressEventSchema.parse(event));
  assert.deepEqual(
    progress.map((event) => event.context.manifest.length),
    [0, 1, 1, 4],
  );
  const completed = progress.at(-1)!;
  assert.equal(completed.progress.activities.at(-1)!.name, "query_records");
  assert.equal(completed.progress.activities.at(-1)!.status, "completed");
  assert.equal(completed.context.status, "partial");
  assert.ok(completed.context.manifest.some((entry) => entry.key === "record:source:row-child"));
  assert.ok(!completed.context.manifest.some((entry) => entry.key === "page:child"));
  assert.equal(runtime.saved().messages.at(-1).context.markdown, "");
});

test("a failed streaming read never grants citation evidence", async (t) => {
  const runtime = fixture(t);
  runtime.controls.forbidden = true;
  const output = await events(await runtime.streamFetch("/ai/chat", request()));
  assert.ok(!output.some((event) => event.type === "delta"));
  const failed = output.find(
    (event) => event.type === "read-progress" && event.progress.activities[0]?.status === "failed",
  );
  assert.ok(failed);
  assert.deepEqual(runtime.saved().messages.at(-1).context.manifest, []);
  assert.equal(runtime.saved().messages.at(-1).status, "failed");
});

test("cancelling a pending read prevents late evidence from being published", async (t) => {
  const runtime = fixture(t);
  runtime.controls.holdReads = true;
  const abort = new AbortController();
  const response = await runtime.streamFetch("/ai/chat", { ...request(), signal: abort.signal });
  abort.abort();
  runtime.controls.releaseReads();
  const output = await events(response);
  assert.ok(!output.some((event) => event.type === "delta"));
  assert.deepEqual(runtime.saved().messages.at(-1).context.manifest, []);
  assert.equal(runtime.saved().messages.at(-1).status, "stopped");
});

for (const toolMode of [false, true]) {
  test(`durable ${toolMode ? "record" : "page"} reads publish metadata through contiguous events`, async (t) => {
    const runtime = fixture(t, `durableAi=1&toolAi=${Number(toolMode)}`);
    const run = (await runtime.api("/ai/turns", request())) as ChatRunReceipt;
    assert.deepEqual(run.context!.manifest, []);
    assert.equal(run.context!.charCount, 0);
    const response = await runtime.streamFetch(`/ai/runs/${run.runId}/events?after=${run.seq}`, {});
    const output = (await response.text())
      .trim()
      .split("\n")
      .map((line) => chatRunEnvelopeSchema.parse(JSON.parse(line)));
    assert.deepEqual(
      output.map((envelope) => envelope.seq),
      [2, 3, 4],
    );
    assert.equal(output[0]!.event.type, "read-progress");
    const saved = runtime.saved();
    assert.deepEqual(
      saved.run.context.manifest.map((entry: { key: string }) => entry.key),
      toolMode ? ["database:database", "source:source", "record:source:row-child"] : ["page:main"],
    );
    assert.deepEqual(saved.messages.at(-1).context, saved.run.context);
    assert.equal(saved.run.context.markdown, "");
  });
}

test("a failed durable read persists empty evidence and a failed activity", async (t) => {
  const runtime = fixture(t, "durableAi=1");
  runtime.controls.forbidden = true;
  const run = (await runtime.api("/ai/turns", request())) as ChatRunReceipt;
  const response = await runtime.streamFetch(`/ai/runs/${run.runId}/events?after=1`, {});
  const output = (await response.text())
    .trim()
    .split("\n")
    .map((line) => chatRunEnvelopeSchema.parse(JSON.parse(line)));
  assert.deepEqual(
    output.map((envelope) => envelope.seq),
    [2, 3],
  );
  assert.equal(output[1]!.event.type, "error");
  assert.deepEqual(runtime.saved().run.context.manifest, []);
  assert.equal(runtime.saved().messages.at(-1).progress.activities[0].status, "failed");
});
