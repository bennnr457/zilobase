import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { runMigrationSets } from "@zilobase/runtime-adapter/node";
import { createDbClientForUrl, runWithDb } from "../infrastructure/database";
import {
  askAiThread,
  askAiTurn,
  member,
  user,
  workspace,
  database,
  dataSource,
  databaseDataSource,
  databaseRow,
  page,
} from "../infrastructure/database/schema";
import { CORE_MIGRATION_SET } from "../public/node-adapter-api";
import { managedAppPolicy } from "../shared/config/app-policy";
import type { ServerOperationContext } from "../services/operations/context";
import {
  beginChatTurn,
  finishChatTurn,
  getChatThread,
  deleteChatThread,
} from "../services/ai/conversations";
import { readDatabaseExport } from "../services/databases/read/operations";
import type { ChatRequest } from "@zilobase/features/runtime";
import type { BuildContextResult } from "@zilobase/page-context";

const connection = process.env.ZILOBASE_AI_VERIFY_URL;
assert.ok(connection, "Use the isolated AI test runner");
const url = new URL(connection);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/zilobase_ai_verify");
const client = createDbClientForUrl(connection);
const second = createDbClientForUrl(connection);
try {
  await client.client.connect();
  await second.client.connect();
  const existing = await client.client.query(
    "select count(*)::int as count from information_schema.tables where table_schema = 'public'",
  );
  assert.equal(existing.rows[0].count, 0, "Refuse a nonempty verification database");
  await runMigrationSets(client.db, [CORE_MIGRATION_SET]);
  await runMigrationSets(client.db, [CORE_MIGRATION_SET]);
  const actors = await client.db
    .insert(user)
    .values([
      { id: "actor", name: "Actor", email: "actor@ai.invalid" },
      { id: "other", name: "Other", email: "other@ai.invalid" },
    ])
    .returning();
  await client.db.insert(workspace).values([
    { id: "workspace", name: "AI", slug: "ai" },
    { id: "other-workspace", name: "Other", slug: "other" },
  ]);
  await client.db.insert(member).values(
    actors.map((actor) => ({
      id: actor.id,
      organizationId: "workspace",
      userId: actor.id,
      role: "owner",
    })),
  );
  const context: ServerOperationContext = {
    authentication: {
      user: actors[0]!,
      session: null,
      authMethod: "session",
      apiKey: null,
      oauthScopes: [],
    },
    activeWorkspaceId: "workspace",
    pinnedWorkspaceId: null,
    env: {},
    policy: managedAppPolicy,
    editionExtension: null,
    runtimePorts: {},
    requestId: randomUUID(),
  };
  const request: ChatRequest = {
    requestId: randomUUID(),
    workspaceId: "workspace",
    text: "Hello",
    roots: [],
    snapshots: [],
    history: [],
  };
  const built: BuildContextResult = {
    version: 1,
    status: "complete",
    markdown: "Private page body",
    charCount: 17,
    manifest: [],
    omissions: [],
    trimmedAttachmentIds: [],
  };
  const run = <T>(fn: () => Promise<T>) => runWithDb(client.db, fn);
  await client.db
    .insert(database)
    .values({ id: "db", workspaceId: "workspace", createdById: "actor", name: "Tasks" });
  await client.db
    .insert(dataSource)
    .values({ id: "source", workspaceId: "workspace", parentDatabaseId: "db", name: "Tasks" });
  await client.db.insert(databaseDataSource).values({ databaseId: "db", dataSourceId: "source" });
  await client.db.insert(page).values(
    Array.from({ length: 205 }, (_, i) => ({
      id: `page-${i}`,
      workspaceId: "workspace",
      createdById: "actor",
      name: `Task ${i}`,
      deletedAt: i === 204 ? new Date() : null,
    })),
  );
  await client.db.insert(databaseRow).values(
    Array.from({ length: 205 }, (_, i) => ({
      id: `row-${i}`,
      dataSourceId: "source",
      pageId: `page-${i}`,
      position: i,
      orderKey: String(i).padStart(4, "0"),
    })),
  );
  const bounded = await run(() => readDatabaseExport(context, { databaseId: "db", rowLimit: 200 }));
  assert.equal(bounded.rows.length, 200);
  assert.equal(bounded.rowCount, 204);
  assert.equal(bounded.rowsPagination?.hasMore, true);
  assert.equal(bounded.rows[0]?.id, "row-0");
  const complete = await run(() => readDatabaseExport(context, { databaseId: "db" }));
  assert.equal(complete.rows.length, 204);
  await assert.rejects(
    run(() => readDatabaseExport(context, { databaseId: "db", rowLimit: 501 })),
    /rowLimit/,
  );
  const claimed = await run(() => beginChatTurn(context, request, built));
  assert.ok(claimed.threadId);
  await assert.rejects(
    runWithDb(second.db, () => beginChatTurn(context, request, built)),
    /still being generated/,
  );
  await run(() =>
    finishChatTurn(request.requestId, "Hello back", "completed", {
      inputTokens: 5,
      outputTokens: 3,
    }),
  );
  const replay = await run(() => beginChatTurn(context, request, built));
  assert.equal(replay.threadId, claimed.threadId);
  assert.equal(replay.replay?.assistantText, "Hello back");
  const rows = await client.db.select().from(askAiTurn);
  assert.equal(rows.length, 1);
  assert.equal("markdown" in rows[0]!.context, false);
  await assert.rejects(
    run(() => beginChatTurn(context, { ...request, text: "Different" }, built)),
    /Request ID/,
  );
  const detail = await run(() => getChatThread(context, "workspace", claimed.threadId));
  assert.equal(detail.messages.length, 2);
  assert.equal(detail.messages[1]?.context?.markdown, "");
  const otherContext = {
    ...context,
    authentication: { ...context.authentication, user: actors[1]! },
  };
  await assert.rejects(
    run(() => getChatThread(otherContext, "workspace", claimed.threadId)),
    /not found/,
  );
  await assert.rejects(
    run(() => getChatThread(context, "other-workspace", claimed.threadId)),
    /Switch/,
  );
  const interrupted = { ...request, requestId: randomUUID(), threadId: claimed.threadId };
  await run(() => beginChatTurn(context, interrupted, built));
  await client.db
    .update(askAiTurn)
    .set({ expiresAt: new Date(0) })
    .where(eq(askAiTurn.id, interrupted.requestId));
  const recovered = await run(() => getChatThread(context, "workspace", claimed.threadId));
  assert.equal(recovered.messages.at(-1)?.status, "interrupted");
  await client.db
    .update(askAiTurn)
    .set({
      context: {
        ...rows[0]!.context,
        manifest: [
          {
            key: "page:removed",
            type: "page",
            id: "removed",
            title: "Removed",
            pageId: "removed",
            provenance: { origin: "saved", capturedAt: new Date().toISOString() },
          },
        ],
      },
    })
    .where(eq(askAiTurn.id, request.requestId));
  await assert.rejects(
    run(() => getChatThread(context, "workspace", claimed.threadId)),
    /no longer accessible/,
  );
  await run(() => deleteChatThread(context, "workspace", claimed.threadId));
  assert.equal((await client.db.select().from(askAiThread)).length, 0);
  assert.equal((await client.db.select().from(askAiTurn)).length, 0);
  console.info(
    "AI migrations, idempotency, private threads, interrupted turns, source revocation and deletion passed.",
  );
} finally {
  await client.client.end();
  await second.client.end();
}
