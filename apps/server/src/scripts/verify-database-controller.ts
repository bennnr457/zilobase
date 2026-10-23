import { searchWorkspaceItems } from "../services/search/workspace-search";
import type {
  DatabaseCommand,
  DatabaseCommandRequest,
  DatabasePropertyEntity,
  PageNavigationPayload,
} from "@zilobase/features/runtime";
import { databaseViewQueryHash } from "@zilobase/features/runtime";
import { runMigrationSets } from "@zilobase/runtime-adapter/node";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../infrastructure/database/schema";
import { Hono } from "hono";
import assert from "node:assert/strict";
import { createDbClientForUrl, runWithDb } from "../infrastructure/database";
import {
  database,
  databaseAccess,
  databaseActorState,
  databaseCommandReceipt,
  databaseDataSource,
  databaseMutationEvent,
  databaseProperty,
  databaseRealtimeOutbox,
  databaseRow,
  databaseView,
  dataSource,
  member,
  page,
  pageProperty,
  user,
  workspace,
} from "../infrastructure/database/schema";
import { CORE_MIGRATION_SET } from "../public/node-adapter-api";
import { pageBrowseRoutes } from "../routes/pages/read/routes";
import { dispatchDatabaseCommand } from "../services/databases/commands/dispatcher";
import { executeDatabaseCommand } from "../services/databases/commands/framework";
import {
  DatabaseViewQueryChangedError,
  getDatabaseRecordWindowService,
} from "../services/databases/read/service";
import type { AppBindings } from "../shared/contracts/http";

const connection = process.env.ZILOBASE_CONTROLLER_VERIFY_URL;
assert.ok(connection, "Use the isolated controller test runner; no default database is allowed");
const url = new URL(connection);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/zilobase_controller_verify");
const first = createDbClientForUrl(connection, { queryTimeoutMillis: 15_000 });
const second = createDbClientForUrl(connection, { queryTimeoutMillis: 15_000 });
try {
  await first.client.connect();
  await second.client.connect();
  const existing = await first.client.query(
    "select count(*)::int as count from information_schema.tables where table_schema = 'public'",
  );
  assert.equal(existing.rows[0].count, 0, "Verification refuses a nonempty database");
  await runMigrationSets(first.db, [CORE_MIGRATION_SET]);
  const nullable = await first.client.query(
    "select is_nullable from information_schema.columns where table_name = 'database_command_receipt' and column_name = 'event_id'",
  );
  assert.equal(nullable.rows[0]?.is_nullable, "YES");
  const [actor, other] = await first.db
    .insert(user)
    .values([
      { id: "actor", name: "Actor", email: "actor@controller.invalid" },
      { id: "other", name: "Other", email: "other@controller.invalid" },
    ])
    .returning();
  await first.db
    .insert(workspace)
    .values({ id: "workspace", name: "Verification", slug: "verification" });
  await first.db.insert(member).values([
    { id: "membership", organizationId: "workspace", userId: "actor", role: "owner" },
    { id: "other-membership", organizationId: "workspace", userId: "other", role: "member" },
  ]);
  await first.db.insert(database).values([
    { id: "host", workspaceId: "workspace", createdById: "actor", name: "Database", config: {} },
    {
      id: "linked-host",
      workspaceId: "workspace",
      createdById: "actor",
      name: "Linked",
      config: {},
    },
  ]);
  await first.db.insert(databaseAccess).values({
    id: "other-access",
    databaseId: "host",
    workspaceId: "workspace",
    targetType: "user",
    targetId: "other",
    accessLevel: "view",
  });
  await first.db.insert(dataSource).values({
    id: "source",
    workspaceId: "workspace",
    parentDatabaseId: "host",
    createdById: "actor",
    name: "Source",
    config: {},
  });
  await first.db.insert(databaseDataSource).values({ databaseId: "host", dataSourceId: "source" });
  await first.db.insert(databaseView).values({
    id: "view",
    databaseId: "host",
    dataSourceId: "source",
    name: "Table",
    type: "table",
    config: {},
  });
  for (const [index, id] of ["a", "b"].entries()) {
    await first.db
      .insert(page)
      .values({ id, workspaceId: "workspace", createdById: "actor", name: id });
    await first.db
      .insert(databaseRow)
      .values({ id, dataSourceId: "source", pageId: id, orderKey: String((index + 1) * 1024) });
  }
  const send = (
    command: DatabaseCommand,
    options: {
      databaseId?: string;
      dataSourceId?: string;
      requestId?: string;
      client?: typeof first;
    } = {},
  ) => {
    const request: DatabaseCommandRequest = {
      command,
      commandId: options.requestId ?? crypto.randomUUID(),
      protocolVersion: 2,
    };
    return executeDatabaseCommand(
      {
        actorId: "actor",
        scope: {
          databaseId: options.databaseId ?? "host",
          dataSourceId: options.dataSourceId ?? null,
        },
        request,
      },
      { database: (options.client ?? first).db, dispatch: dispatchDatabaseCommand },
    );
  };
  const nav = async (activeActor: typeof actor) => {
    const app = new Hono<AppBindings>();
    app.use("*", async (c, next) => {
      c.set("user", activeActor!);
      c.set("authMethod", "session");
      await next();
    });
    app.route("/pages", pageBrowseRoutes);
    const response = await runWithDb(first.db, async () =>
      app.request("/pages?workspaceId=workspace&fields=nav"),
    );
    assert.equal(response.status, 200, await response.clone().text());
    return ((await response.json()) as PageNavigationPayload).databases.find(
      ({ id }) => id === "host",
    )!;
  };
  const favoriteCommand = { type: "database.favorite", favorite: true } as const;
  const favoriteAck = await send(favoriteCommand, { requestId: "favorite-once" });
  assert.deepEqual(await send(favoriteCommand, { requestId: "favorite-once" }), favoriteAck);
  assert.equal(favoriteAck.privateConfirmation?.revision, 1);
  assert.deepEqual((await nav(actor)).actorState, {
    actorId: "actor",
    revision: 1,
    isFavorite: true,
  });
  assert.deepEqual((await nav(other)).actorState, {
    actorId: "other",
    revision: 0,
    isFavorite: false,
  });
  assert.equal((await first.db.select().from(databaseMutationEvent)).length, 0);
  assert.equal((await first.db.select().from(databaseRealtimeOutbox)).length, 0);
  const concurrent = await Promise.all([
    send({ type: "database.favorite", favorite: false }),
    send({ type: "database.favorite", favorite: true }, { client: second }),
  ]);
  concurrent.sort((a, b) => a.privateConfirmation!.revision - b.privateConfirmation!.revision);
  assert.deepEqual(
    concurrent.map((ack) => ack.privateConfirmation!.revision),
    [2, 3],
  );
  assert.equal(
    (await nav(actor)).isFavorite,
    (concurrent[1]!.result as { isFavorite: boolean }).isFavorite,
  );
  assert.equal((await first.db.select().from(databaseActorState)).length, 1);
  console.info(
    "Passed real private receipts, idempotent replay, concurrent actor ordering and navigation isolation.",
  );

  const read = (hash: string) =>
    runWithDb(first.db, () =>
      getDatabaseRecordWindowService({
        databaseId: "host",
        dataSourceId: "source",
        viewId: "view",
        userId: "actor",
        expectedQueryHash: hash,
      }),
    );
  const emptyHash = databaseViewQueryHash({});
  assert.equal((await read(emptyHash)).queryHash, emptyHash);
  const sorts = [{ column: "name", direction: "descending" }];
  await send({
    type: "view.update",
    viewId: "view",
    patch: { configuration: [{ operation: "set", path: ["sorts"], value: sorts }] },
  });
  await assert.rejects(read(emptyHash), DatabaseViewQueryChangedError);
  assert.equal((await read(databaseViewQueryHash({ sorts }))).records[0]?.id, "b");
  const placement = await send(
    {
      type: "row.change",
      rowId: "b",
      placement: { afterRowId: null, beforeRowId: "a" },
      clearSortViewId: "view",
    },
    { dataSourceId: "source" },
  );
  assert.ok(placement.event?.areas.includes("views"));
  assert.ok(placement.event?.areas.includes("records"));
  assert.deepEqual(
    (await read(emptyHash)).records.map(({ id }) => id),
    ["b", "a"],
  );
  const before = await first.db.select().from(databaseRow).orderBy(asc(databaseRow.orderKey));
  await assert.rejects(
    send(
      {
        type: "row.change",
        rowId: "a",
        placement: { afterRowId: null, beforeRowId: "b" },
        clearSortViewId: "missing",
      },
      { dataSourceId: "source", requestId: "reject-compound" },
    ),
  );
  assert.deepEqual(
    await first.db.select().from(databaseRow).orderBy(asc(databaseRow.orderKey)),
    before,
  );
  assert.equal(
    (
      await first.db
        .select()
        .from(databaseCommandReceipt)
        .where(eq(databaseCommandReceipt.commandId, "reject-compound"))
    ).length,
    0,
  );
  const sourceBefore = (await first.db.select().from(dataSource))[0]!.version;
  const setup = await send({
    type: "view.update",
    viewId: "view",
    patch: { configuration: [{ operation: "set", path: ["subItems"], value: { enabled: true } }] },
  });
  assert.equal(setup.sourceVersions.source, sourceBefore + 1);
  for (let index = 0; index < 2; index++)
    await send(
      {
        type: "dataSource.link",
        dataSourceId: "source",
        afterId: null,
        beforeId: null,
        view: { name: "Linked", type: "table", config: {} },
      },
      { databaseId: "linked-host" },
    );
  assert.equal(
    (await first.db.select().from(databaseView).where(eq(databaseView.databaseId, "linked-host")))
      .length,
    2,
  );
  const archiveSourceVersion = (await first.db.select().from(dataSource))[0]!.version;
  const archived = await send({ type: "database.archive" });
  assert.equal(archived.sourceVersions.source, archiveSourceVersion + 1);
  const archiveEvents = await first.db
    .select()
    .from(databaseMutationEvent)
    .where(eq(databaseMutationEvent.commandId, archived.commandId));
  assert.ok(
    archiveEvents.some((event) => event.databaseId === "linked-host" && event.requiresReset),
  );
  const restored = await send({ type: "database.restore" });
  assert.equal(restored.sourceVersions.source, archiveSourceVersion + 2);
  assert.deepEqual(
    (await read(emptyHash)).records.map(({ id }) => id),
    ["b", "a"],
  );
  console.info(
    "Passed real query hashes, atomic sort/drop rollback, sub-item source revisions and source-link/view compounds.",
  );
  console.info(
    "Passed archive/restore source revisions, linked-host resets and restored record ordering.",
  );
  const sharedDefinition = (
    await send(
      {
        type: "property.create",
        name: "Shared definition",
        propertyType: "text",
        config: { left: 0, right: 0 },
        afterPropertyId: null,
        beforePropertyId: null,
      },
      { dataSourceId: "source" },
    )
  ).result as DatabasePropertyEntity;
  await first.db.insert(dataSource).values({
    id: "second-source",
    workspaceId: "workspace",
    parentDatabaseId: "linked-host",
    createdById: "actor",
    name: "Second source",
    config: {},
  });
  await first.db
    .insert(databaseDataSource)
    .values({ databaseId: "linked-host", dataSourceId: "second-source" });
  await first.db.insert(databaseProperty).values({
    id: "second-binding",
    dataSourceId: "second-source",
    propertyId: sharedDefinition.propertyId,
    position: 0,
  });
  const confirmations = await Promise.all([
    send(
      {
        type: "property.update",
        propertyId: sharedDefinition.id,
        patch: { configuration: [{ operation: "set", path: ["left"], value: 1 }] },
      },
      { dataSourceId: "source" },
    ),
    send(
      {
        type: "property.update",
        propertyId: "second-binding",
        patch: { configuration: [{ operation: "set", path: ["right"], value: 2 }] },
      },
      { databaseId: "linked-host", dataSourceId: "second-source", client: second },
    ),
  ]);
  const [definition] = await first.db
    .select()
    .from(pageProperty)
    .where(eq(pageProperty.id, sharedDefinition.propertyId));
  assert.deepEqual(definition!.config, { left: 1, right: 2 });
  const stamps = confirmations
    .map((ack) => Date.parse((ack.result as DatabasePropertyEntity).property.updatedAt))
    .sort((a, b) => a - b);
  assert(
    stamps[1]! > stamps[0]!,
    "Shared definition confirmations must advance across different source lanes",
  );
  console.info(
    "Passed different-field definition edits through two bindings, hosts and PostgreSQL clients.",
  );
  await first.client
    .query(`insert into page_property_value (id, page_id, property_id, value, created_at, updated_at)
    select 'stamp-value', p.id, d.id, 'null'::jsonb, now(), now() from page p cross join page_property d limit 1`);
  // All five existing entity stamps must order writers after row-lock acquisition,
  // even when callers supplied timestamps before waiting for another transaction.
  for (const table of [
    "page",
    "page_property",
    "page_property_value",
    "database_row",
    "database_property",
  ]) {
    const initial = await first.client.query(`select id, updated_at from "${table}" limit 1`);
    assert(initial.rows.length, `Fixture must include ${table}`);
    const { id, updated_at: original } = initial.rows[0];
    await first.client.query("begin");
    const committed = await first.client.query(
      `update "${table}" set updated_at = '1900-01-01' where id = $1 returning updated_at`,
      [id],
    );
    const competing = second.client.query(
      `update "${table}" set updated_at = '1900-01-01' where id = $1 returning updated_at`,
      [id],
    );
    await first.client.query("commit");
    const later = await competing;
    assert(
      committed.rows[0].updated_at.getTime() > original.getTime(),
      `${table}: first stamp must advance at millisecond precision`,
    );
    assert(
      later.rows[0].updated_at.getTime() > committed.rows[0].updated_at.getTime(),
      `${table}: competing stamp must advance after acquiring its row lock`,
    );
  }
  console.info(
    "Passed millisecond-safe entity confirmation stamps across two independent PostgreSQL clients.",
  );
  const statements: string[] = [];
  const measured = {
    ...first,
    db: drizzle(first.client, {
      schema,
      logger: {
        logQuery(query) {
          statements.push(query);
        },
      },
    }),
  };
  const samples: Array<{ size: number; ms: number; rowReads: number }> = [];
  for (const size of [2, 252]) {
    if (size > 2) {
      const pages = Array.from({ length: 250 }, (_, index) => ({
        id: `budget-${index}`,
        workspaceId: "workspace",
        createdById: "actor",
        name: `Budget ${index}`,
      }));
      await first.db.insert(page).values(pages);
      await first.db.insert(databaseRow).values(
        pages.map(({ id }, index) => ({
          id,
          pageId: id,
          dataSourceId: "source",
          orderKey: String((index + 10) * 1024),
        })),
      );
    }
    for (let iteration = 0; iteration < 10; iteration++) {
      statements.length = 0;
      const started = performance.now();
      const requestId = `budget-${size}-${iteration}`;
      const command = { type: "row.change", rowId: "a", title: requestId } as const;
      const ack = await send(command, { client: measured, dataSourceId: "source", requestId });
      const ms = performance.now() - started;
      const rowReads = statements.filter(
        (query) => query.startsWith("select ") && query.includes('from "database_row"'),
      );
      assert.ok(rowReads.length > 0);
      for (const query of rowReads)
        assert.match(query, /"database_row"\."id" = /, "Content edits must not list the source");
      samples.push({ size, ms, rowReads: rowReads.length });
      statements.length = 0;
      assert.deepEqual(
        await send(command, { client: measured, dataSourceId: "source", requestId }),
        ack,
      );
      assert.ok(
        !statements.some((query) => query.includes('from "database_row"')),
        "Receipt replay must not read a row again",
      );
    }
  }
  assert.equal(new Set(samples.map(({ rowReads }) => rowReads)).size, 1);
  for (const size of [2, 252]) {
    const times = samples
      .filter((sample) => sample.size === size)
      .map(({ ms }) => ms)
      .sort((a, b) => a - b);
    console.info(
      JSON.stringify({
        event: "content-edit-budget",
        fixtureRows: size,
        samples: times.length,
        rowReads: samples[0]!.rowReads,
        p50Ms: times[4],
        p95Ms: times[9],
      }),
    );
  }
  const facts = await first.db
    .select()
    .from(schema.databaseAutomationEventWindow)
    .where(eq(schema.databaseAutomationEventWindow.rowId, "a"));
  assert.ok(
    facts.some((fact) => (fact.afterValues as Record<string, unknown>).name === "budget-252-9"),
  );
  await Promise.all([
    send({ type: "row.change", rowId: "a", title: "Concurrent edit" }, { dataSourceId: "source" }),
    send(
      { type: "row.change", rowId: "a", placement: { afterRowId: "b", beforeRowId: null } },
      { client: second, dataSourceId: "source" },
    ),
  ]);
  await Promise.all([
    send(
      { type: "row.change", rowId: "a", title: "Concurrent archive" },
      { dataSourceId: "source" },
    ),
    send({ type: "row.archive", rowId: "b" }, { client: second, dataSourceId: "source" }),
  ]);
  await send({ type: "row.restore", rowId: "b" }, { dataSourceId: "source" });
  const sharedEvents = await first.db
    .select()
    .from(databaseMutationEvent)
    .where(eq(databaseMutationEvent.commandId, "budget-252-9"));
  assert.ok(sharedEvents.some((event) => event.databaseId === "host"));
  assert.ok(sharedEvents.some((event) => event.databaseId === "linked-host"));
  console.info(
    "Passed bounded content work, replay, automation facts, shared hosts and concurrent edit/move/archive operations.",
  );

  // Cold search must resolve source names without first opening a database.
  await first.db.insert(database).values([
    { id: "naming-host", workspaceId: "workspace", createdById: "actor", name: "New database" },
    { id: "naming-private", workspaceId: "workspace", createdById: "actor", name: "Private" },
  ]);
  await first.db.insert(dataSource).values([
    {
      id: "naming-source",
      workspaceId: "workspace",
      parentDatabaseId: "naming-host",
      createdById: "actor",
      name: "Projects",
      config: { emoji: "🚀" },
    },
    {
      id: "naming-secret",
      workspaceId: "workspace",
      parentDatabaseId: "naming-private",
      createdById: "actor",
      name: "Confidential roadmap",
    },
  ]);
  await first.db.insert(databaseDataSource).values([
    { databaseId: "naming-host", dataSourceId: "naming-source", position: 0 },
    { databaseId: "naming-private", dataSourceId: "naming-secret", position: 0 },
  ]);
  await first.db.insert(databaseView).values({
    id: "naming-view",
    databaseId: "naming-host",
    dataSourceId: "naming-source",
    name: "Table",
    type: "table",
    position: 1,
  });
  await first.db.insert(databaseAccess).values({
    id: "naming-access",
    databaseId: "naming-host",
    workspaceId: "workspace",
    targetType: "user",
    targetId: "other",
    accessLevel: "view",
  });
  const search = (query: string, userId = "actor") =>
    runWithDb(first.db, () =>
      searchWorkspaceItems({ workspaceId: "workspace", userId, query, types: ["database"] }),
    );
  const cold = (await search("")).find((item) => item.id === "naming-host")!;
  assert.equal(cold.title, "Projects");
  assert.equal(cold.emoji, "🚀");
  assert.equal(cold.titleSource?.id, "naming-source");
  assert.equal(
    (await search("Projects")).find((item) => item.id === "naming-host")?.title,
    "Projects",
  );
  await send(
    { type: "dataSource.update", patch: { name: "Launch plans" } },
    { databaseId: "naming-host", dataSourceId: "naming-source" },
  );
  assert.equal(
    (await search("Launch plans")).find((item) => item.id === "naming-host")?.title,
    "Launch plans",
  );
  assert.equal(
    (await search("Projects")).some((item) => item.id === "naming-host"),
    false,
  );
  await first.db
    .insert(databaseDataSource)
    .values({ databaseId: "naming-host", dataSourceId: "naming-secret", position: 1 });
  await first.db.insert(databaseView).values({
    id: "naming-linked-view",
    databaseId: "naming-host",
    dataSourceId: "naming-secret",
    name: "Linked table",
    type: "table",
    position: 0,
  });
  assert.equal(
    (await search("")).find((item) => item.id === "naming-host")?.title,
    "Confidential roadmap",
  );
  assert.equal(
    (await search("", "other")).find((item) => item.id === "naming-host")?.title,
    "Launch plans",
  );
  assert.equal(
    (await search("Confidential roadmap", "other")).some((item) => item.id === "naming-host"),
    false,
  );
  console.info(
    "Passed cold database search titles, source-name matching, renames and linked-source access isolation.",
  );
} finally {
  await Promise.all([first.client.end(), second.client.end()]);
}
