import { BACKGROUND_LANE_POLICY } from "../infrastructure/background/task-v2";
import { createNodeQueueRuntime } from "@zilobase/runtime-adapter/node";
import { processAiGeneration } from "../services/ai/background";
import { chatRunResponse } from "../routes/ai/durable-stream";
import { backgroundTaskLane, parseBackgroundTask } from "../infrastructure/background/contracts";
import { createBackgroundDeliveryStore } from "../infrastructure/background/publication";
import { runBackgroundDelivery } from "../app/background/delivery";
import { runWithIndependentDbEnv } from "../infrastructure/database";
import type { Ports } from "@zilobase/runtime-ports";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { runWithRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import { runMigrationSets } from "@zilobase/runtime-adapter/node";
import { CORE_MIGRATION_SET } from "../public/node-adapter-api";
import { createDbClientForUrl, runWithDb } from "../infrastructure/database";
import {
  askAiRun,
  askAiRunInput,
  askAiTurn,
  backgroundDispatch,
  member,
  session,
  user,
  workspace,
} from "../infrastructure/database/schema";
import {
  admitChatRun,
  cancelChatRun,
  checkpointChatRun,
  claimChatRun,
  readChatRunPage,
  getChatRequest,
} from "../services/ai/runs";
import type { ServerOperationContext } from "../services/operations/context";
import { managedAppPolicy } from "../shared/config/app-policy";
const connection = process.env.ZILOBASE_BACKGROUND_VERIFY_URL;
assert.ok(connection, "Use scripts/ai/test-durable.mjs");
assert.equal(new URL(connection).pathname, "/zilobase_background_verify");
const client = createDbClientForUrl(connection);
const env = {
  DATABASE_URL: connection,
  ZILOBASE_CELL_ID: "test",
  OPENAI_API_KEY: "fixture",
  AI_DURABLE_STREAMING_ENABLED: "true",
  AI_RUN_PAYLOAD_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString("base64"),
};
const ports: Partial<Ports> = { jobs: { dispatch: async () => {} } };
try {
  await client.client.connect();
  assert.equal(
    (
      await client.client.query(
        "select count(*)::int as count from information_schema.tables where table_schema='public'",
      )
    ).rows[0].count,
    0,
  );
  await runMigrationSets(client.db, [CORE_MIGRATION_SET]);
  await runWithRuntimePorts(ports, () =>
    runWithDb(client.db, async () => {
      const [actor] = await client.db
        .insert(user)
        .values({ id: "actor", name: "Test", email: "durable@test.invalid" })
        .returning();
      await client.db.insert(workspace).values({ id: "workspace", name: "Test", slug: "test" });
      await client.db
        .insert(member)
        .values({ id: "member", organizationId: "workspace", userId: "actor", role: "owner" });
      const [login] = await client.db
        .insert(session)
        .values({
          id: "session",
          token: "fixture-only",
          userId: "actor",
          activeWorkspaceId: "workspace",
          expiresAt: new Date(Date.now() + 3600_000),
        })
        .returning();
      const context = {
        env,
        runtimePorts: ports,
        policy: managedAppPolicy,
        authentication: {
          user: actor,
          session: login,
          authMethod: "session",
          apiKey: null,
          oauthScopes: null,
        },
        activeWorkspaceId: "workspace",
        pinnedWorkspaceId: null,
        editionExtension: null,
        requestId: "http",
      } as ServerOperationContext;
      const request = {
        requestId: randomUUID(),
        workspaceId: "workspace",
        text: "First",
        roots: [],
        snapshots: [],
        history: [],
      };
      const receipt = await admitChatRun(context, request);
      assert.deepEqual(
        await admitChatRun(context, request),
        receipt,
        "duplicate submit resolves the original run",
      );
      assert.equal((await client.db.select().from(backgroundDispatch)).length, 1);
      await assert.rejects(admitChatRun(context, { ...request, text: "Different" }), /Request ID/);
      await assert.rejects(
        admitChatRun(context, { ...request, requestId: randomUUID(), threadId: receipt.threadId }),
        /current answer/,
      );
      assert.equal(
        (await client.db.select().from(askAiTurn)).length,
        1,
        "failed admission rolls back",
      );
      assert.equal(
        (await client.db.select().from(askAiRunInput))[0]?.sealed.includes("First"),
        false,
      );
      const run = await claimChatRun(receipt.runId, "owner", "test");
      assert.ok(run);
      await assert.rejects(claimChatRun(receipt.runId, "duplicate", "test"), /BUSY/);
      await checkpointChatRun(run.id, "owner", run.fence, { text: "Saved" });
      const page = await readChatRunPage(context, run.id, "workspace", 0);
      assert.equal(page.snapshot.text, "Saved");
      assert.equal(page.snapshot.seq, 1);
      assert.equal(page.events[0]?.seq, 1);
      await assert.rejects(
        checkpointChatRun(run.id, "stale", run.fence, { text: "wrong" }),
        /LEASE_LOST/,
      );
      await cancelChatRun(context, run.id, "workspace");
      await assert.rejects(
        checkpointChatRun(run.id, "owner", run.fence, { text: "late" }, "completed"),
        /CANCELLED/,
      );
      await checkpointChatRun(run.id, "owner", run.fence, {}, "stopped");
      assert.equal(
        (await getChatRequest(context, request.requestId, "workspace")).status,
        "stopped",
      );
      assert.equal((await client.db.select().from(askAiRunInput)).length, 0);
      await client.db.delete(member).where(eq(member.id, "member"));
      await assert.rejects(readChatRunPage(context, run.id, "workspace", 0), /Forbidden/);
      await client.db
        .insert(member)
        .values({ id: "member", organizationId: "workspace", userId: "actor", role: "owner" });
      let calls = 0;
      const queueEnv = { ...env, QUEUE_REDIS_URL: process.env.ZILOBASE_QUEUE_VERIFY_URL };
      const queue = createNodeQueueRuntime(queueEnv, {
        lane: (task) => backgroundTaskLane(task.kind as never),
        validate: (body) => {
          const task = parseBackgroundTask(body, "test");
          if (!task.ok) throw new Error(task.errorCode);
          return task.task;
        },
        policy: BACKGROUND_LANE_POLICY,
        deliver: (body, lane, workerId) =>
          runWithRuntimePorts(ports, () =>
            runWithIndependentDbEnv(env, () =>
              runBackgroundDelivery({
                body,
                lane,
                cellId: "test",
                store: createBackgroundDeliveryStore(env, workerId),
                execute: (task) =>
                  processAiGeneration(
                    env,
                    { runId: task.resourceId, workerId },
                    async function* () {
                      calls++;
                      yield { text: "A" };
                      await new Promise((resolve) => setTimeout(resolve, 350));
                      yield { text: "nswer" };
                      yield { completed: true };
                    },
                  ),
              }),
            ),
          ),
        exhausted: async () => {},
        maintain: async () => {},
      });
      try {
        await queue.start();
        ports.jobs = { dispatch: queue.dispatch };
        const admitted = await admitChatRun(context, {
          ...request,
          requestId: randomUUID(),
          text: "Queue test",
        });
        const subscriber = chatRunResponse(context, admitted, 0).body!.getReader();
        await subscriber.read();
        await subscriber.cancel();
        for (let attempt = 0; ; attempt++) {
          const receipt = await getChatRequest(context, admitted.requestId, "workspace");
          if (receipt.status === "completed") {
            assert.equal(receipt.text, "Answer");
            break;
          }
          assert.ok(attempt < 100, "queued producer must finish after subscriber disconnect");
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        const resumed = await readChatRunPage(context, admitted.runId, "workspace", 0);
        assert.equal(
          resumed.events
            .filter((entry) => entry.event.type === "delta")
            .map((entry) => (entry.event.type === "delta" ? entry.event.text : ""))
            .join(""),
          "Answer",
        );
        assert.equal(calls, 1, "reconnecting does not generate twice");
      } finally {
        await queue.stop();
        ports.jobs = { dispatch: async () => {} };
      }
      console.info(
        "Durable AI PostgreSQL: idempotency, atomic admission, encryption, fencing, replay, cancellation and access revocation passed.",
      );
    }),
  );
} finally {
  await client.client.end();
}
