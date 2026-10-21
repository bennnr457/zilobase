import { expect, test, vi } from "vitest";
vi.mock("../operations/context", async (original) => ({
  ...(await original<typeof import("../operations/context")>()),
  runServerOperation: async (_: unknown, run: () => Promise<unknown>) => run(),
}));
import type { ServerOperationContext } from "../operations/context";
import { ServerOperationError } from "../operations/context";
import { chatRequestSchema } from "@zilobase/features/runtime";
import { createAgentState } from "./agent-state";
import { createReadTools, readToolSchemas, type ReadToolDependencies } from "./read-tools";

export function readFixture() {
  const context = {
    env: {},
    authentication: { user: { id: "actor" } },
  } as unknown as ServerOperationContext;
  const request = chatRequestSchema.parse({
    workspaceId: "workspace",
    requestId: "11111111-1111-4111-8111-111111111111",
    text: "Question about page:page and [[database:db]]",
  });
  const state = createAgentState(request.workspaceId, request.roots, [
    { role: "user", content: request.text },
  ]);
  const dependencies = {
    authorizeWorkspace: vi.fn(async () => ({})),
    metadataRevision: vi.fn(async () => "v1"),
    authorizeDatabase: vi.fn(async () => ({})),
    authorizePage: vi.fn(async () => ({})),
    document: vi.fn(async ({}, input: { pageId: string; offset?: number }) => ({
      title: input.pageId,
      revision: "v1",
      offset: input.offset ?? 0,
      entries:
        input.pageId === "page"
          ? [{ kind: "reference", resource: { type: "page", id: "linked" } }]
          : [{ kind: "text", block: 0, text: "Private linked content" }],
      hasMore: false,
    })),
    describe: vi.fn(async () => ({
      title: "Tasks",
      revision: "v1",
      section: "sources",
      entries: [{ id: "source", name: "Tasks" }],
      hasMore: false,
    })),
    query: vi.fn(async ({}, input: { recordId?: string }) => ({
      revision: { database: 1, source: 1 },
      properties: [],
      records: [
        {
          id: input.recordId ?? "row",
          pageId: "row-page",
          name: "Task",
          parentRowId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          values: {},
        },
      ],
      positions: [{ id: "row", value: "row" }],
      hasMore: true,
    })),
    aggregate: vi.fn(async () => ({
      revision: { database: 1, source: 1 },
      operation: "count",
      value: 800,
      matchingRecords: 800,
      complete: true,
    })),
  } as unknown as ReadToolDependencies;
  const signal = new AbortController().signal;
  const tools = createReadTools(context, state, {
    signal,
    maxCalls: 24,
    maxResultBytes: 6000,
    dependencies,
  });
  const call = async (name: keyof typeof tools, raw: unknown) => {
    const input = readToolSchemas[name].parse(raw);
    const execute = tools[name].execute! as (input: unknown, options: unknown) => Promise<any>;
    return execute(input, { toolCallId: `tool-${state.calls}`, messages: [], abortSignal: signal });
  };
  return { context, state, dependencies, signal, tools, call };
}

test("only read operations are registered and @mentions do not read content", () => {
  const { tools, dependencies } = readFixture();
  expect(Object.keys(tools)).toEqual([
    "describe_source",
    "read_page",
    "query_records",
    "read_record",
    "aggregate_records",
  ]);
  expect(dependencies.document).not.toHaveBeenCalled();
  expect(dependencies.query).not.toHaveBeenCalled();
});

test("database metadata and records have explicit resource identities", async () => {
  const { call } = readFixture();
  const sources = await call("describe_source", { type: "database", id: "db" });
  expect(sources).toMatchObject({
    databaseId: "db",
    entries: [{ kind: "data_source", databaseId: "db", dataSourceId: "source", name: "Tasks" }],
  });
  expect(sources.entries[0]).not.toHaveProperty("id");
  expect(sources.next).toContain("query_records");
  const properties = await call("describe_source", {
    type: "database",
    id: "db",
    dataSourceId: "source",
    section: "properties",
  });
  expect(properties.entries[0]).toMatchObject({ kind: "property", propertyId: "source" });
  const records = await call("query_records", { databaseId: "db", dataSourceId: "source" });
  expect(records.records[0]).toMatchObject({
    kind: "record",
    recordId: "row",
    pageId: "row-page",
    databaseId: "db",
    dataSourceId: "source",
  });
  expect(records.records[0]).not.toHaveProperty("id");
});

test("progress identifies the source while running and after completion without extra reads", async () => {
  const fixture = readFixture();
  const snapshots: unknown[] = [];
  const tools = createReadTools(fixture.context, fixture.state, {
    signal: fixture.signal,
    maxCalls: 24,
    maxResultBytes: 6000,
    dependencies: fixture.dependencies,
    changed: async () => {
      snapshots.push(structuredClone(fixture.state.progress.activities));
    },
  });
  await tools.read_page.execute!(
    { pageId: "page", cursor: null },
    {
      toolCallId: "read-page",
      messages: [],
      abortSignal: fixture.signal,
      context: {},
    },
  );
  expect(snapshots).toMatchObject([
    [{ source: { type: "page", id: "page" }, status: "running" }],
    [{ source: { type: "page", id: "page" }, status: "completed" }],
  ]);
  expect(fixture.dependencies.document).toHaveBeenCalledTimes(1);
  await fixture.call("query_records", { databaseId: "db", dataSourceId: "source" });
  expect(fixture.state.progress.activities.at(-1)?.source).toEqual({
    type: "database",
    id: "db",
    dataSourceId: "source",
  });
});

test("guessed IDs are denied; links become readable only after discovery", async () => {
  const { call, dependencies } = readFixture();
  expect(await call("read_page", { pageId: "linked" })).toMatchObject({
    error: { code: expect.stringContaining("OUT_OF_SCOPE") },
  });
  expect(dependencies.document).not.toHaveBeenCalled();
  expect(await call("read_page", { pageId: "page" })).toMatchObject({
    entries: [{ kind: "reference" }],
  });
  expect(await call("read_page", { pageId: "linked" })).toMatchObject({
    entries: [{ text: "Private linked content" }],
  });
  expect(
    await call("query_records", { databaseId: "other", dataSourceId: "source" }),
  ).toMatchObject({ error: { code: expect.stringContaining("OUT_OF_SCOPE") } });
  expect(dependencies.query).not.toHaveBeenCalled();
});

test("pagination binds the query and revision; rows discover their page bodies", async () => {
  const { call, dependencies, state } = readFixture();
  const first = await call("query_records", { databaseId: "db", dataSourceId: "source" });
  expect(first).toMatchObject({ coverage: { complete: false, returned: 1, total: null } });
  const cursor = first.continuation.nextCursor;
  expect(typeof cursor).toBe("string");
  expect(
    await call("query_records", {
      databaseId: "db",
      dataSourceId: "source",
      nameContains: "changed",
      cursor,
    }),
  ).toMatchObject({ error: { code: expect.stringContaining("INVALID_CURSOR") } });
  await call("query_records", { databaseId: "db", dataSourceId: "source", cursor });
  expect(dependencies.query).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ databaseId: "db" }),
    { id: "row", value: "row" },
    { database: 1, source: 1 },
  );
  expect(await call("read_page", { pageId: "row-page" })).toMatchObject({
    coverage: { complete: true },
  });
  expect(state.progress.canContinue).toBe(true);
});

test("revoked parent access blocks a previously discovered page", async () => {
  const { call, dependencies } = readFixture();
  await call("query_records", { databaseId: "db", dataSourceId: "source" });
  vi.mocked(dependencies.authorizeDatabase).mockRejectedValueOnce(
    new ServerOperationError({ error: "Forbidden" }, 403),
  );
  expect(await call("read_page", { pageId: "row-page" })).toMatchObject({
    error: { code: "SOURCE_UNAVAILABLE" },
  });
  expect(dependencies.document).not.toHaveBeenCalled();
});

test("expired cursors fail without a source query", async () => {
  const { call, state, dependencies } = readFixture();
  const first = await call("query_records", { databaseId: "db", dataSourceId: "source" });
  state.cursors[first.continuation.nextCursor]!.expiresAt = 0;
  vi.mocked(dependencies.query).mockClear();
  expect(
    await call("query_records", {
      databaseId: "db",
      dataSourceId: "source",
      cursor: first.continuation.nextCursor,
    }),
  ).toMatchObject({ error: { code: expect.stringContaining("CURSOR_EXPIRED") } });
  expect(dependencies.query).not.toHaveBeenCalled();
});

test("concurrent calls cannot overrun the tool budget or three active reads", async () => {
  const fixture = readFixture();
  const tools = createReadTools(fixture.context, fixture.state, {
    signal: fixture.signal,
    maxCalls: 3,
    maxResultBytes: 6000,
    dependencies: fixture.dependencies,
  });
  let running = 0,
    maximum = 0;
  vi.mocked(fixture.dependencies.document).mockImplementation(async () => {
    running++;
    maximum = Math.max(maximum, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running--;
    return { title: "Page", revision: "1", entries: [], offset: 0, hasMore: false };
  });
  const execute = tools.read_page.execute!;
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      execute(
        { pageId: "page", cursor: null },
        { toolCallId: String(i), messages: [], abortSignal: fixture.signal, context: {} },
      ),
    ),
  );
  expect(fixture.dependencies.document).toHaveBeenCalledTimes(3);
  expect(maximum).toBeLessThanOrEqual(3);
  expect(results.filter((r) => !!r && typeof r === "object" && "error" in r)).toHaveLength(5);
});

test("exact counts use an aggregate operation rather than sampled record pages", async () => {
  const { call, dependencies } = readFixture();
  expect(
    await call("aggregate_records", {
      databaseId: "db",
      dataSourceId: "source",
      operation: "count",
    }),
  ).toMatchObject({ value: 800, coverage: { complete: true } });
  expect(dependencies.query).not.toHaveBeenCalled();
});

test("paging beyond 200 record references keeps a bounded working set without imposing a record ceiling", async () => {
  const { call, state, dependencies } = readFixture();
  for (let i = 0; i < 210; i++)
    state.grants.push({
      resource: { type: "page", id: `old-${i}` },
      parent: { type: "database", id: "db" },
    });
  // Start at the supported working-set bound, with earlier record references retained.
  state.grants.splice(2, 12);
  expect(state.grants).toHaveLength(200);
  const result = await call("query_records", { databaseId: "db", dataSourceId: "source" });
  expect(result).toMatchObject({ coverage: { returned: 1 } });
  expect(state.grants).toHaveLength(200);
  expect(state.grants.some((g) => g.resource.id === "row-page")).toBe(true);
  expect(state.grants.some((g) => g.resource.id === "db")).toBe(true);
  expect(dependencies.query).toHaveBeenCalledOnce();
});

test("raw tool log contains the exact selected input and result without leaking them into progress", async () => {
  const { state, call } = readFixture();
  await call("read_page", { pageId: "page" });
  const result = await call("read_page", { pageId: "linked" });
  const events = state.debug!.events;
  expect(events.map((event) => event.type)).toEqual([
    "tool.call",
    "tool.result",
    "tool.call",
    "tool.result",
  ]);
  expect(JSON.parse(events[2]!.payload)).toEqual({ pageId: "linked", cursor: null });
  expect(JSON.parse(events[3]!.payload)).toEqual(result);
  expect(events[3]).toMatchObject({ tool: "read_page", toolCallId: "tool-1", step: 1 });
  expect(events[3]!.durationMs).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(state.progress)).not.toContain("Private linked content");
});

test("failed authorized reads log the same safe error returned to the model", async () => {
  const { state, call, dependencies } = readFixture();
  vi.mocked(dependencies.document).mockRejectedValueOnce(
    new ServerOperationError({ error: "Private internal failure" }, 403),
  );
  const result = await call("read_page", { pageId: "page" });
  expect(result.error.code).toBe("SOURCE_UNAVAILABLE");
  expect(JSON.parse(state.debug!.events.at(-1)!.payload)).toEqual(result);
  expect(JSON.stringify(state.debug)).not.toContain("Private internal failure");
});

test("a text reference cannot bypass page authorization or produce citation evidence on failure", async () => {
  const { call, dependencies, state } = readFixture();
  vi.mocked(dependencies.document).mockRejectedValueOnce(
    new ServerOperationError({ error: "Forbidden" }, 403),
  );
  expect(await call("read_page", { pageId: "page" })).toMatchObject({
    error: { code: "SOURCE_UNAVAILABLE" },
  });
  expect(dependencies.document).toHaveBeenCalledWith(
    expect.objectContaining({ pinnedWorkspaceId: "workspace" }),
    expect.objectContaining({ pageId: "page" }),
  );
  expect(state.context.manifest).toEqual([]);
});

test("cached metadata revalidates revision, records reuse and stops inspection loops", async () => {
  const { call, state, dependencies } = readFixture();
  const input = { type: "database", id: "db" };
  await call("describe_source", input);
  for (let i = 0; i < 3; i++)
    expect(await call("describe_source", input)).toMatchObject({ cached: true });
  expect(dependencies.describe).toHaveBeenCalledTimes(1);
  expect(dependencies.metadataRevision).toHaveBeenCalledTimes(3);
  expect(state.progress.activities.at(-1)).toMatchObject({ cached: true });
  expect(state.progress.stopReason).toBe("no_progress");
  expect(state.progress.canContinue).toBe(true);
  vi.mocked(dependencies.metadataRevision!).mockResolvedValueOnce("v2");
  vi.mocked(dependencies.describe).mockResolvedValueOnce({
    title: "Changed",
    revision: "v2",
    section: "sources",
    entries: [],
    hasMore: false,
  });
  expect(await call("describe_source", input)).toMatchObject({ title: "Changed", entries: [] });
  expect(dependencies.describe).toHaveBeenCalledTimes(2);
  expect(state.knowledge!.sources).toHaveLength(0);
});

test("known source IDs receive an authorized correction without becoming page grants", async () => {
  const { call, state, dependencies } = readFixture();
  await call("describe_source", { type: "database", id: "db" });
  expect(await call("read_page", { pageId: "source" })).toMatchObject({
    error: { code: "RESOURCE_TYPE_MISMATCH" },
    next: { tool: "query_records", input: { databaseId: "db", dataSourceId: "source" } },
  });
  expect(dependencies.document).not.toHaveBeenCalled();
  expect(state.grants.some((entry) => entry.resource.id === "source")).toBe(false);
  vi.mocked(dependencies.authorizeDatabase).mockRejectedValueOnce(
    new ServerOperationError({ error: "Forbidden" }, 403),
  );
  const denied = await call("read_page", { pageId: "source" });
  expect(denied).toMatchObject({ error: { code: "SOURCE_UNAVAILABLE" } });
  expect(denied).not.toHaveProperty("next");
  expect(await call("read_page", { pageId: "unknown" })).toMatchObject({
    error: { code: "OUT_OF_SCOPE" },
  });
});

test("revoked metadata is forgotten and denied pending reads cannot be continued", async () => {
  const { call, state, dependencies } = readFixture();
  await call("describe_source", { type: "database", id: "db" });
  await call("query_records", { databaseId: "db", dataSourceId: "source" });
  expect(Object.keys(state.pending)).toHaveLength(1);
  vi.mocked(dependencies.metadataRevision!).mockRejectedValueOnce(
    new ServerOperationError({ error: "Forbidden" }, 403),
  );
  expect(await call("describe_source", { type: "database", id: "db" })).toMatchObject({
    error: { code: "SOURCE_UNAVAILABLE" },
  });
  expect(state.knowledge!.inspections).toHaveLength(0);
  expect(state.knowledge!.sources).toHaveLength(0);
  expect(Object.keys(state.pending)).toHaveLength(0);
  expect(Object.keys(state.cursors)).toHaveLength(0);
  expect(state.progress.canContinue).toBe(false);
});
