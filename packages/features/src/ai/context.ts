import {
  CONTEXT_VERSION,
  extractDatabaseIds,
  type ResourceRef,
  type WorkspaceContext,
  type ContextProvenance,
  type ContextDataSource,
  type DatabasePropertySchema,
  type DatabaseViewSchema,
} from "@zilobase/page-context";

export type LocalPageSnapshot = { pageId: string; content: unknown; capturedAt: string };
export type ContextPageRead = {
  id: string;
  name: string;
  workspaceId: string;
  content?: unknown;
  updatedAt: string | Date;
  deletedAt?: unknown;
};
export type ContextDatabaseRead = {
  database: {
    id: string;
    name: string;
    workspaceId: string;
    pageId: string | null;
    version: number;
    config?: unknown;
  };
  dataSources: Array<{
    id: string;
    name: string;
    parentDatabaseId: string;
    config?: unknown;
    version?: number;
  }>;
  activeDataSource: { id: string } | null;
  views: DatabaseViewSchema[];
  properties: DatabasePropertySchema[];
  rows: Array<{
    id: string;
    pageId: string;
    parentRowId?: string | null;
    position: number;
    page: { name: string };
  }>;
  values: Array<{ pageId: string; propertyId: string; value: unknown }>;
  rowCount?: number;
  rowsPagination?: { hasMore: boolean };
};
export type ContextReadPorts = {
  page: (id: string) => Promise<ContextPageRead>;
  database: (id: string, sourceId?: string) => Promise<ContextDatabaseRead>;
  check: () => void;
  now: () => string;
};

export function parsePageDocument(content: unknown): unknown {
  const value: unknown = typeof content === "string" ? JSON.parse(content) : content;
  if (value === null || value === undefined) return { type: "doc", content: [] };
  let nodes = 0;
  const visit = (node: unknown, depth: number) => {
    if (++nodes > 20_000 || depth > 64 || !node || typeof node !== "object" || Array.isArray(node))
      throw new Error("Invalid or oversized page document");
    const record = node as Record<string, unknown>;
    if (
      typeof record.type !== "string" ||
      (record.text !== undefined && typeof record.text !== "string")
    )
      throw new Error("Invalid page node");
    if (
      record.attrs !== undefined &&
      (!record.attrs || typeof record.attrs !== "object" || Array.isArray(record.attrs))
    )
      throw new Error("Invalid page attributes");
    if (
      record.marks !== undefined &&
      (!Array.isArray(record.marks) ||
        record.marks.some(
          (mark) => !mark || typeof mark !== "object" || typeof mark.type !== "string",
        ))
    )
      throw new Error("Invalid page marks");
    if (record.content !== undefined) {
      if (!Array.isArray(record.content)) throw new Error("Invalid page content");
      record.content.forEach((child) => visit(child, depth + 1));
    }
  };
  if (JSON.stringify(value).length > 1_000_000)
    throw new Error("Page document exceeds context limit");
  visit(value, 0);
  return value;
}

export async function collectWorkspaceContext(
  input: {
    workspaceId: string;
    roots: ResourceRef[];
    snapshots?: LocalPageSnapshot[];
  },
  ports: ContextReadPorts,
): Promise<WorkspaceContext> {
  if (input.roots.length > 20) throw new Error("Attach at most 20 resources");
  const context: WorkspaceContext = {
    version: CONTEXT_VERSION,
    roots: [...new Map(input.roots.map((ref) => [`${ref.type}:${ref.id}`, ref])).values()],
    pages: [],
    databases: [],
    sources: [],
    unavailable: [],
  };
  const snapshots = new Map((input.snapshots ?? []).map((s) => [s.pageId, s]));
  const databaseReads = new Map<string, Promise<ContextDatabaseRead>>();
  const sources = new Map<string, ContextDataSource>();
  const checkWorkspace = (workspaceId: string) => {
    ports.check();
    if (workspaceId !== input.workspaceId)
      throw new Error("Resource is outside the selected workspace");
  };
  const readDatabase = (id: string, sourceId?: string) => {
    ports.check();
    const key = JSON.stringify([id, sourceId]);
    if (!databaseReads.has(key)) databaseReads.set(key, ports.database(id, sourceId));
    return databaseReads.get(key)!;
  };
  const loadDatabase = async (id: string) => {
    if (context.databases.some((db) => db.id === id)) return;
    if (context.databases.length >= 20) throw new Error("Embedded database limit reached");
    const read = await readDatabase(id);
    checkWorkspace(read.database.workspaceId);
    const provenance: ContextProvenance = {
      capturedAt: ports.now(),
      origin: "saved",
      revision: String(read.database.version),
    };
    const database = {
      ...read.database,
      sourceIds: [] as string[],
      views: [] as DatabaseViewSchema[],
      provenance,
      coverage: { complete: true, reasons: [] as string[] },
    };
    context.databases.push(database);
    // Sequential reads bound concurrency and preserve deterministic source order.
    for (const source of read.dataSources) {
      ports.check();
      try {
        const existing = sources.get(source.id);
        if (existing) {
          if (!existing.hostDatabaseIds.includes(id)) existing.hostDatabaseIds.push(id);
          database.sourceIds.push(source.id);
          continue;
        }
        if (sources.size >= 50) throw new Error("Source limit reached");
        const payload =
          read.activeDataSource?.id === source.id ? read : await readDatabase(id, source.id);
        checkWorkspace(payload.database.workspaceId);
        if (payload.activeDataSource?.id !== source.id) throw new Error("Source unavailable");
        const total = payload.rowCount;
        const complete =
          !payload.rowsPagination?.hasMore && (total === undefined || payload.rows.length >= total);
        const normalized: ContextDataSource = {
          ...source,
          hostDatabaseIds: [id],
          provenance: {
            ...provenance,
            capturedAt: ports.now(),
            revision: source.version === undefined ? undefined : String(source.version),
          },
          properties: payload.properties,
          rows: payload.rows.map((row) => ({
            id: row.id,
            pageId: row.pageId,
            parentRowId: row.parentRowId,
            position: row.position,
            name: row.page.name,
          })),
          values: payload.values,
          coverage: {
            complete,
            totalRows: total,
            includedRows: payload.rows.length,
            omittedRows: total === undefined ? undefined : Math.max(0, total - payload.rows.length),
            reasons: complete ? [] : ["Source acquisition is incomplete"],
          },
        };
        sources.set(source.id, normalized);
        database.sourceIds.push(source.id);
      } catch {
        ports.check();
        database.coverage.complete = false;
        database.coverage.reasons.push("An embedded source could not be loaded");
      }
    }
    database.views = read.views.filter((view) => database.sourceIds.includes(view.dataSourceId));
  };
  for (const root of context.roots) {
    ports.check();
    if (root.type === "database") {
      await loadDatabase(root.id);
      continue;
    }
    const page = await ports.page(root.id);
    checkWorkspace(page.workspaceId);
    if (page.deletedAt) throw new Error("Selected page is deleted");
    const snapshot = snapshots.get(root.id);
    const content = parsePageDocument(snapshot?.content ?? page.content);
    const databaseIds = extractDatabaseIds(content);
    const loadedIds: string[] = [];
    const coverage = { complete: true, reasons: [] as string[] };
    for (const id of databaseIds) {
      try {
        await loadDatabase(id);
        loadedIds.push(id);
      } catch {
        ports.check();
        context.unavailable.push({
          parent: root,
          reason: "An embedded database could not be loaded",
        });
        coverage.complete = false;
        coverage.reasons.push("Embedded database unavailable");
      }
    }
    context.pages.push({
      id: page.id,
      title: page.name,
      path: page.name,
      content,
      databaseIds: loadedIds,
      provenance: {
        capturedAt: snapshot?.capturedAt ?? ports.now(),
        origin: snapshot ? "local-editor" : "saved",
        revision: String(page.updatedAt),
      },
      coverage,
    });
  }
  ports.check();
  context.sources = [...sources.values()];
  return context;
}
