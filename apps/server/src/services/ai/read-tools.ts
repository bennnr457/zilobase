import { createHash, randomUUID } from "node:crypto";
import type { AiDiagnostics } from "./diagnostics";
import { tool } from "ai";
import { z } from "zod";
import {
  sourceRecordQuerySchema,
  type ChatToolName,
  type SourceReadRevision,
  type SourceRecordPosition,
} from "@zilobase/features/runtime";
import type { ContextManifestEntry, ResourceRef } from "@zilobase/page-context";
import { readDocumentWindow, readPageIdentity } from "../pages/read/document-window";
import {
  aggregateSourceRecords,
  authorizeSourceRead,
  describeDatabaseSource,
  querySourceRecords,
} from "../databases/read/source-query";
import {
  runServerOperation,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { authorizeChatWorkspace } from "./context";
import { updateReadCoverage, type AgentState } from "./agent-state";

const id = z.string().min(1).max(128);
const cursor = z.string().max(128).nullable().default(null);
const describeSchema = z
  .object({
    type: z.enum(["page", "database"]),
    id,
    dataSourceId: id.nullable().default(null),
    section: z.enum(["sources", "properties", "views"]).default("sources"),
    cursor,
  })
  .strict();
const pageSchema = z.object({ pageId: id, cursor }).strict();
const recordsSchema = sourceRecordQuerySchema.extend({ cursor }).strict();
const recordSchema = z
  .object({
    databaseId: id,
    dataSourceId: id,
    recordId: id,
    propertyIds: z.array(id).max(20).default([]),
  })
  .strict();
const aggregateSchema = sourceRecordQuerySchema
  .omit({ limit: true, recordId: true, sort: true, direction: true, propertyIds: true })
  .extend({
    operation: z.enum(["count", "sum", "avg", "min", "max"]),
    propertyId: id.nullable().default(null),
  })
  .strict();
export const readToolSchemas = {
  describe_source: describeSchema,
  read_page: pageSchema,
  query_records: recordsSchema,
  read_record: recordSchema,
  aggregate_records: aggregateSchema,
};
export const readToolSchemaBytes =
  Buffer.byteLength(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(readToolSchemas).map(([name, schema]) => [name, z.toJSONSchema(schema)]),
      ),
    ),
  ) + 2048;

export type ReadToolDependencies = {
  document: typeof readDocumentWindow;
  describe: typeof describeDatabaseSource;
  query: typeof querySourceRecords;
  aggregate: typeof aggregateSourceRecords;
  authorizeDatabase: typeof authorizeSourceRead;
  authorizePage: typeof readPageIdentity;
  authorizeWorkspace: typeof authorizeChatWorkspace;
};
const dependencies: ReadToolDependencies = {
  document: readDocumentWindow,
  describe: describeDatabaseSource,
  query: querySourceRecords,
  aggregate: aggregateSourceRecords,
  authorizeDatabase: authorizeSourceRead,
  authorizePage: readPageIdentity,
  authorizeWorkspace: authorizeChatWorkspace,
};
const key = (resource: ResourceRef) => `${resource.type}:${resource.id}`;
const fingerprint = (name: string, input: Record<string, unknown>) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        name,
        Object.fromEntries(
          Object.entries(input)
            .filter(([k]) => !["cursor", "limit"].includes(k))
            .sort(([a], [b]) => a.localeCompare(b)),
        ),
      ]),
    )
    .digest("hex");
class ReadToolError extends Error {}
const fail = (code: string): never => {
  throw new ReadToolError(code);
};

export function createReadTools(
  context: ServerOperationContext,
  state: AgentState,
  options: {
    signal: AbortSignal;
    maxCalls: number;
    maxResultBytes: number;
    changed?: () => Promise<void>;
    dependencies?: ReadToolDependencies;
    diagnostics?: AiDiagnostics;
  },
) {
  const ports = options.dependencies ?? dependencies;
  const scoped = { ...context, pinnedWorkspaceId: state.workspaceId };
  const check = () => {
    options.signal.throwIfAborted();
    if (Date.now() > state.expiresAt) fail("CURSOR_EXPIRED");
  };
  const assertGrant = async (resource: ResourceRef, seen = new Set<string>()) => {
    const grant = state.grants.find((g) => key(g.resource) === key(resource));
    if (!grant || seen.has(key(resource)) || seen.size >= 8)
      fail("OUT_OF_SCOPE: attach this source with @ before reading it");
    seen.add(key(resource));
    if (grant!.parent) {
      await assertGrant(grant!.parent, seen);
      if (grant!.parent.type === "database")
        await ports.authorizeDatabase(scoped, grant!.parent.id, grant!.sourceId);
      else await ports.authorizePage(scoped, grant!.parent.id);
    }
  };
  const grant = (resource: ResourceRef, parent: ResourceRef, sourceId?: string) => {
    if (state.grants.some((g) => key(g.resource) === key(resource))) return;
    if (state.grants.length >= 200) {
      // Keep a bounded working set, not a lifetime ceiling on paginated records.
      // Evicted record pages can be discovered again through read_record.
      const pinned = new Set([
        ...state.roots.map(key),
        ...state.grants.flatMap((g) => (g.parent ? [key(g.parent)] : [])),
        ...Object.values(state.pending).flatMap((read) =>
          read.name === "read_page" ? [`page:${String(read.input.pageId)}`] : [],
        ),
      ]);
      const evict = state.grants.findIndex((g) => !pinned.has(key(g.resource)));
      if (evict < 0) fail("SOURCE_LIMIT: finish pending reads or attach a more specific source");
      state.grants.splice(evict, 1);
    }
    state.grants.push({ resource, parent, sourceId });
  };
  const evidence = (entry: Omit<ContextManifestEntry, "provenance">, revision: unknown) => {
    const record: ContextManifestEntry = {
      ...entry,
      title: entry.title.slice(0, 512),
      provenance: {
        capturedAt: new Date().toISOString(),
        origin: "saved",
        revision: JSON.stringify(revision),
      },
    };
    const index = state.context.manifest.findIndex((e) => e.key === entry.key);
    if (index >= 0) state.context.manifest[index] = record;
    else if (state.context.manifest.length < 1000) state.context.manifest.push(record);
  };
  const readCursor = (name: string, input: Record<string, unknown>) => {
    if (!input.cursor) return undefined;
    const value = state.cursors[String(input.cursor)];
    if (!value || value.expiresAt < Date.now())
      fail("CURSOR_EXPIRED: restart this query without a cursor");
    if (value.fingerprint !== fingerprint(name, input))
      fail("INVALID_CURSOR: cursor belongs to a different query");
    return value;
  };
  const continuation = (
    name: ChatToolName,
    input: Record<string, unknown>,
    revision: unknown,
    position: unknown,
    hasMore: boolean,
  ) => {
    const hash = fingerprint(name, input);
    delete state.pending[hash];
    if (input.cursor) delete state.cursors[String(input.cursor)];
    let nextCursor: string | null = null;
    if (hasMore) {
      // Replace the consumed cursor; retained cursors are bounded with the source graph.
      if (Object.keys(state.cursors).length >= 200) fail("CURSOR_LIMIT");
      nextCursor = randomUUID();
      state.cursors[nextCursor] = {
        fingerprint: hash,
        revision,
        position,
        expiresAt: state.expiresAt,
      };
      state.pending[hash] = { name, input: { ...input, cursor: nextCursor } };
    }
    updateReadCoverage(state);
    return nextCursor;
  };
  const fit = <T>(items: T[], render: (items: T[]) => unknown) => {
    const selected: T[] = [];
    for (const item of items) {
      if (
        Buffer.byteLength(JSON.stringify(render([...selected, item]))) >
        options.maxResultBytes - 1024
      )
        break;
      selected.push(item);
    }
    if (!selected.length && items.length)
      fail("ITEM_TOO_LARGE: select fewer properties or read a smaller section");
    return selected;
  };
  let active = 0;
  const waiters: Array<() => void> = [];
  const execute = async (
    name: ChatToolName,
    input: Record<string, unknown>,
    toolCallId: string,
    run: () => Promise<unknown>,
  ) => {
    check();
    if (state.calls >= options.maxCalls) {
      state.progress.stopReason = "tool_budget";
      updateReadCoverage(state);
      return {
        error: {
          code: "BUDGET_EXHAUSTED",
          message: "Do not call more tools. Answer using available evidence and disclose coverage.",
        },
      };
    }
    state.calls++;
    const activity = {
      id: toolCallId,
      name,
      status: "running" as "running" | "completed" | "failed",
      label: {
        describe_source: "Inspecting source",
        read_page: "Reading page",
        query_records: "Reading records",
        read_record: "Reading record",
        aggregate_records: "Calculating totals",
      }[name],
      returned: undefined as number | undefined,
      hasMore: undefined as boolean | undefined,
      error: undefined as string | undefined,
    };
    state.progress.activities.push(activity);
    const queuedAt = performance.now();
    while (active >= 3) {
      await new Promise<void>((resolve) => waiters.push(resolve));
      check();
    }
    active++;
    const timing = options.diagnostics?.start("tool", {
      tool: name,
      toolCallId,
      calls: state.calls,
      waitMs: performance.now() - queuedAt,
    });
    try {
      await options.changed?.();
      const read = () =>
        runServerOperation(
          scoped,
          async () => {
            check();
            await ports.authorizeWorkspace(scoped, state.workspaceId);
            return run();
          },
          { onTiming: options.diagnostics?.databaseTiming("tool") },
        );
      const result = options.diagnostics
        ? await options.diagnostics.measure("tool_read", read, { tool: name, toolCallId })
        : await read();
      check();
      if (Buffer.byteLength(JSON.stringify(result)) > options.maxResultBytes)
        fail("RESULT_TOO_LARGE");
      activity.status = "completed";
      if (result && typeof result === "object" && "coverage" in result) {
        const coverage = result.coverage as { returned?: number; complete: boolean };
        activity.returned = coverage.returned;
        activity.hasMore = !coverage.complete;
      }
      await options.changed?.();
      return result;
    } catch (error) {
      check();
      activity.status = "failed";
      activity.error =
        error instanceof ServerOperationError
          ? [403, 404].includes(error.status)
            ? "SOURCE_UNAVAILABLE"
            : String(error.body.error).slice(0, 512)
          : error instanceof ReadToolError
            ? error.message.slice(0, 512)
            : "READ_FAILED";
      await options.changed?.();
      return {
        error: {
          code: activity.error,
          message:
            "Do not infer content from a failed read. Correct the query or explain the limitation.",
        },
      };
    } finally {
      timing?.({ outcome: activity.status, returned: activity.returned });
      active--;
      waiters.shift()?.();
    }
  };
  const pageRead = async (
    name: "read_page" | "describe_source",
    input: Record<string, unknown>,
    pageId: string,
    outline = false,
  ) => {
    const parent: ResourceRef = { type: "page", id: pageId };
    await assertGrant(parent);
    const previous = readCursor(name, input);
    const result = await ports.document(scoped, {
      pageId,
      outline,
      offset: previous?.position as number | undefined,
      revision: previous?.revision as string | undefined,
    });
    const entries = fit(result.entries, (entries) => ({
      title: result.title.slice(0, 512),
      entries,
    }));
    const hasMore = result.hasMore || entries.length < result.entries.length;
    const nextCursor = continuation(
      name,
      input,
      result.revision,
      result.offset + entries.length,
      hasMore,
    );
    for (const entry of entries) if (entry.kind === "reference") grant(entry.resource, parent);
    evidence(
      { key: `page:${pageId}`, type: "page", id: pageId, title: result.title, pageId },
      result.revision,
    );
    return {
      title: result.title.slice(0, 512),
      revision: result.revision,
      entries,
      evidence: [`[[page:${pageId}]]`],
      coverage: {
        scope: outline ? "outline" : "page",
        complete: !hasMore,
        returned: entries.length,
      },
      continuation: { nextCursor },
    };
  };
  const queryRead = async (name: "query_records" | "read_record", raw: Record<string, unknown>) => {
    const { cursor: _cursor, ...args } = raw;
    const query = sourceRecordQuerySchema.parse(args);
    const parent: ResourceRef = { type: "database", id: query.databaseId };
    await assertGrant(parent);
    const previous = readCursor(name, raw);
    const result = await ports.query(
      scoped,
      query,
      previous?.position as SourceRecordPosition | undefined,
      previous?.revision as SourceReadRevision | undefined,
    );
    const records = fit(result.records, (records) => ({ records, properties: result.properties }));
    const hasMore = result.hasMore || records.length < result.records.length;
    const nextCursor = continuation(
      name,
      raw,
      result.revision,
      result.positions[records.length - 1],
      hasMore,
    );
    evidence(
      {
        key: `database:${query.databaseId}`,
        type: "database",
        id: query.databaseId,
        title: "Database",
        databaseId: query.databaseId,
      },
      result.revision,
    );
    evidence(
      {
        key: `source:${query.dataSourceId}`,
        type: "source",
        id: query.dataSourceId,
        title: "Records",
        databaseId: query.databaseId,
        sourceId: query.dataSourceId,
      },
      result.revision,
    );
    for (const record of records) {
      grant({ type: "page", id: record.pageId }, parent, query.dataSourceId);
      evidence(
        {
          key: `record:${query.dataSourceId}:${record.id}`,
          type: "record",
          id: record.id,
          title: record.name,
          databaseId: query.databaseId,
          sourceId: query.dataSourceId,
          pageId: record.pageId,
        },
        result.revision,
      );
      for (const property of result.properties)
        if (property.type === "relation") {
          const value = record.values[property.id];
          for (const pageId of Array.isArray(value) ? value : [value])
            if (typeof pageId === "string" && pageId.length <= 128)
              grant({ type: "page", id: pageId }, parent, query.dataSourceId);
        }
    }
    return {
      revision: result.revision,
      records,
      properties: result.properties,
      evidence: [`[[source:${query.dataSourceId}]]`],
      coverage: {
        scope: "matching-records",
        complete: !hasMore,
        returned: records.length,
        total: null,
      },
      continuation: { nextCursor },
    };
  };
  return {
    describe_source: tool({
      description:
        "Inspect a mentioned or discovered page outline, or database sources/properties/views. No records are read. Database properties and views require a dataSourceId; use section=sources first. Follow nextCursor to inspect more metadata.",
      inputSchema: describeSchema,
      execute: (input, { toolCallId }) =>
        execute("describe_source", input, toolCallId, async () => {
          if (input.type === "page") return pageRead("describe_source", input, input.id, true);
          await assertGrant({ type: "database", id: input.id });
          const previous = readCursor("describe_source", input);
          const result = await ports.describe(scoped, {
            databaseId: input.id,
            dataSourceId: input.dataSourceId ?? undefined,
            section: input.section,
            after: previous?.position as string | undefined,
            revision: previous?.revision as string | undefined,
          });
          const entries = fit(result.entries, (entries) => ({
            title: result.title.slice(0, 512),
            entries,
          }));
          const hasMore = result.hasMore || entries.length < result.entries.length;
          const nextCursor = continuation(
            "describe_source",
            input,
            result.revision,
            entries.at(-1)?.id,
            hasMore,
          );
          evidence(
            {
              key: `database:${input.id}`,
              type: "database",
              id: input.id,
              title: result.title,
              databaseId: input.id,
            },
            result.revision,
          );
          return {
            title: result.title.slice(0, 512),
            revision: result.revision,
            section: result.section,
            entries,
            evidence: [`[[database:${input.id}]]`],
            coverage: { scope: input.section, complete: !hasMore, returned: entries.length },
            continuation: { nextCursor },
          };
        }),
    }),
    read_page: tool({
      description:
        "Read saved page content in bounded chunks. References in returned entries can be read next. Continue with nextCursor; never claim the full page was read while more chunks remain.",
      inputSchema: pageSchema,
      execute: (input, { toolCallId }) =>
        execute("read_page", input, toolCallId, () => pageRead("read_page", input, input.pageId)),
    }),
    query_records: tool({
      description:
        "Read a page of source records. Choose propertyIds from describe_source; only requested properties are returned. Filters are ANDed and use stored scalar values, not view filters. Sort supports id/name/createdAt/updatedAt. Computed-property values/filters and saved-view queries are unsupported. Pass the same query with nextCursor for more records. Record page bodies require read_page.",
      inputSchema: recordsSchema,
      execute: (input, { toolCallId }) =>
        execute("query_records", input, toolCallId, () => queryRead("query_records", input)),
    }),
    read_record: tool({
      description:
        "Read selected properties of one record in a mentioned/discovered database source. The returned pageId can be read with read_page.",
      inputSchema: recordSchema,
      execute: (input, { toolCallId }) =>
        execute("read_record", input, toolCallId, () => queryRead("read_record", input)),
    }),
    aggregate_records: tool({
      description:
        "Compute an exact count, or sum/avg/min/max of a numeric property over all matching source records on the server. Uses the same scalar AND filters as query_records. Never count sampled pages yourself. Grouping and computed properties are unsupported.",
      inputSchema: aggregateSchema,
      execute: (input, { toolCallId }) =>
        execute("aggregate_records", input, toolCallId, async () => {
          await assertGrant({ type: "database", id: input.databaseId });
          const query = sourceRecordQuerySchema.parse({
            databaseId: input.databaseId,
            dataSourceId: input.dataSourceId,
            filters: input.filters,
            nameContains: input.nameContains,
          });
          const result = await ports.aggregate(
            scoped,
            query,
            input.operation,
            input.propertyId ?? undefined,
          );
          evidence(
            {
              key: `source:${input.dataSourceId}`,
              type: "source",
              id: input.dataSourceId,
              title: "Aggregate",
              databaseId: input.databaseId,
              sourceId: input.dataSourceId,
            },
            result.revision,
          );
          return {
            ...result,
            evidence: [`[[source:${input.dataSourceId}]]`],
            coverage: {
              scope: "matching-records",
              complete: true,
              returned: result.matchingRecords,
            },
          };
        }),
    }),
  };
}
