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
const ports = { jobs: { dispatch: async () => {} } };
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
      console.info(
        "Durable AI PostgreSQL: idempotency, atomic admission, encryption, fencing, replay, cancellation and access revocation passed.",
      );
    }),
  );
} finally {
  await client.client.end();
}
