import type { ModelMessage } from "ai";
import type { ResourceRef } from "@zilobase/page-context";
import type { ChatToolName } from "@zilobase/features/runtime";
import type { AgentState } from "./agent-state";

export type InspectionInput = {
  type: "database";
  id: string;
  dataSourceId: string | null;
  section: string;
  cursor: string | null;
};
type InspectionResult = Record<string, unknown> & {
  entries?: Array<Record<string, unknown>>;
  coverage?: { complete?: boolean; returned?: number };
  continuation?: { nextCursor?: string | null };
};
type LegacyToolInput = Record<string, unknown> & {
  id: string;
  pageId: string;
  databaseId: string;
  dataSourceId?: string;
  section?: string;
  cursor?: string;
};
type Inspection = {
  key: string;
  input: InspectionInput;
  revision: string;
  result: InspectionResult;
  hits: number;
};
export type AgentKnowledge = {
  sources: Array<{
    databaseId: string;
    dataSourceId: string;
    name: string;
    recordsRead: boolean;
    revision?: string;
  }>;
  inspections: Inspection[];
  reads: Array<{
    tool: ChatToolName;
    resource: ResourceRef;
    dataSourceId?: string;
    section?: string;
    complete: boolean;
    returned: number;
  }>;
  repeatedInspections: number;
  unavailable: string[];
  inventoryLimited?: boolean;
};
export const newAgentKnowledge = (): AgentKnowledge => ({
  sources: [],
  inspections: [],
  reads: [],
  repeatedInspections: 0,
  unavailable: [],
});
export const inspectionKey = (input: InspectionInput) =>
  JSON.stringify([input.id, input.dataSourceId, input.section, input.cursor]);

/** Pure bounded, encrypted-checkpoint memory. It never authorizes a resource. */
export function rememberInspection(
  state: AgentState,
  input: InspectionInput,
  result: InspectionResult,
) {
  const knowledge = state.knowledge!;
  const key = inspectionKey(input);
  knowledge.inspections = knowledge.inspections.filter((entry) => entry.key !== key);
  knowledge.inspections.push({ key, input, result, revision: String(result.revision), hits: 0 });
  while (
    knowledge.inspections.length > 32 ||
    new TextEncoder().encode(JSON.stringify(knowledge.inspections)).length > 65_536
  )
    knowledge.inspections.shift();
  for (const entry of result.entries ?? []) {
    if (input.section !== "sources") continue;
    const dataSourceId = entry.dataSourceId ?? entry.id;
    if (typeof dataSourceId !== "string") continue;
    const old = knowledge.sources.find(
      (source) => source.databaseId === input.id && source.dataSourceId === dataSourceId,
    );
    const revision =
      entry.version === undefined
        ? undefined
        : `${String(result.revision).split(":")[0]}:${entry.version}`;
    if (old) {
      old.name = String(entry.name ?? "").slice(0, 128);
      old.revision = revision;
    } else
      knowledge.sources.push({
        databaseId: input.id,
        dataSourceId,
        name: String(entry.name ?? "").slice(0, 128),
        recordsRead: false,
        revision,
      });
  }
  if (knowledge.sources.length > 100) {
    knowledge.inventoryLimited = true;
    state.progress.stopReason = "memory_budget";
  }
  knowledge.sources = knowledge.sources.slice(0, 100);
  rememberRead(
    state,
    "describe_source",
    { type: "database", id: input.id },
    !!result.coverage?.complete,
    result.coverage?.returned ?? 0,
    input.dataSourceId ?? undefined,
    input.section,
  );
}
export function rememberRead(
  state: AgentState,
  tool: ChatToolName,
  resource: ResourceRef,
  complete: boolean,
  returned: number,
  dataSourceId?: string,
  section?: string,
) {
  const knowledge = state.knowledge!;
  const match = (entry: AgentKnowledge["reads"][number]) =>
    entry.tool === tool &&
    entry.resource.type === resource.type &&
    entry.resource.id === resource.id &&
    entry.dataSourceId === dataSourceId &&
    entry.section === section;
  knowledge.reads = knowledge.reads.filter((entry) => !match(entry));
  knowledge.reads.push({ tool, resource, dataSourceId, section, complete, returned });
  knowledge.reads = knowledge.reads.slice(-640);
  if (tool !== "describe_source") {
    knowledge.repeatedInspections = 0;
    if (resource.type === "database") {
      const source = knowledge.sources.find(
        (entry) => entry.databaseId === resource.id && entry.dataSourceId === dataSourceId,
      );
      if (source) source.recordsRead = complete;
    }
  }
}
export function forgetDatabaseKnowledge(state: AgentState, databaseId: string) {
  const knowledge = state.knowledge!;
  knowledge.sources = knowledge.sources.filter((entry) => entry.databaseId !== databaseId);
  knowledge.inspections = knowledge.inspections.filter((entry) => entry.input.id !== databaseId);
  knowledge.reads = knowledge.reads.filter(
    (entry) => entry.resource.type !== "database" || entry.resource.id !== databaseId,
  );
}

export function markReadUnavailable(state: AgentState, resource: ResourceRef) {
  const key = `${resource.type}:${resource.id}`;
  if (!state.knowledge!.unavailable.includes(key)) state.knowledge!.unavailable.push(key);
  state.knowledge!.unavailable = state.knowledge!.unavailable.slice(-200);
  if (resource.type === "database") forgetDatabaseKnowledge(state, resource.id);
  const dependentPages = new Set(
    state.grants
      .filter((grant) => grant.parent?.type === resource.type && grant.parent.id === resource.id)
      .map((grant) => grant.resource.id),
  );
  for (const [fingerprint, pending] of Object.entries(state.pending)) {
    const id = pending.input.pageId ?? pending.input.databaseId ?? pending.input.id;
    if (id === resource.id || dependentPages.has(String(id))) {
      if (typeof pending.input.cursor === "string") delete state.cursors[pending.input.cursor];
      delete state.pending[fingerprint];
    }
  }
}

/** Upgrade optional memory on legacy v2 checkpoints using the originating call, never a guessed ID type. */
export function restoreAgentKnowledge(state: AgentState) {
  if (state.knowledge) {
    state.knowledge.unavailable ??= [];
    return;
  }
  state.knowledge = newAgentKnowledge();
  const calls = new Map<string, { name: string; input: LegacyToolInput }>();
  for (const message of state.messages) {
    if (typeof message.content === "string") continue;
    for (const part of message.content) {
      if (part.type === "tool-call" && part.input && typeof part.input === "object")
        calls.set(part.toolCallId, {
          name: part.toolName,
          input: part.input as LegacyToolInput,
        });
      if (part.type !== "tool-result" || part.output.type !== "json") continue;
      const call = calls.get(part.toolCallId);
      const result = part.output.value as InspectionResult | null;
      if (!call || !result || result.error) continue;
      const input = call.input;
      if (
        call.name === "describe_source" &&
        input.type === "database" &&
        Array.isArray(result.entries)
      )
        rememberInspection(
          state,
          {
            type: "database",
            id: input.id,
            dataSourceId: input.dataSourceId ?? null,
            section: input.section ?? "sources",
            cursor: input.cursor ?? null,
          },
          {
            ...result,
            entries: result.entries.map((entry: Record<string, unknown>) => {
              const { id, ...fields } = entry;
              const section = input.section ?? "sources";
              return {
                ...fields,
                kind:
                  section === "sources"
                    ? "data_source"
                    : section === "properties"
                      ? "property"
                      : "view",
                databaseId: input.id,
                ...(section === "sources"
                  ? { dataSourceId: fields.dataSourceId ?? id }
                  : {
                      dataSourceId: input.dataSourceId,
                      [section === "properties" ? "propertyId" : "viewId"]:
                        fields[section === "properties" ? "propertyId" : "viewId"] ?? id,
                    }),
              };
            }),
          },
        );
      else if (
        call.name === "read_page" ||
        ["query_records", "read_record", "aggregate_records"].includes(call.name)
      )
        rememberRead(
          state,
          call.name as ChatToolName,
          call.name === "read_page"
            ? { type: "page", id: input.pageId }
            : { type: "database", id: input.databaseId },
          !!result.coverage?.complete,
          result.coverage?.returned ?? 0,
          input.dataSourceId,
        );
    }
  }
}

/** Small data-only inventory survives compaction; names and configs remain untrusted source data. */
export function agentKnowledgeSummary(state: AgentState) {
  const knowledge = state.knowledge!;
  const inventory: {
    sources: typeof knowledge.sources;
    discovered: ResourceRef[];
    inspections: Array<Record<string, unknown>>;
    reads: typeof knowledge.reads;
    pending: typeof state.pending;
    inventoryLimited?: boolean;
    summaryLimited: boolean;
  } = {
    sources: [],
    discovered: [],
    inspections: [],
    reads: [],
    pending: {},
    inventoryLimited: knowledge.inventoryLimited,
    summaryLimited: false,
  };
  const fits = () => new TextEncoder().encode(JSON.stringify(inventory)).length <= 6000;
  for (const source of [...knowledge.sources].sort(
    (a, b) => Number(a.recordsRead) - Number(b.recordsRead),
  )) {
    inventory.sources.push(source);
    if (!fits()) {
      inventory.sources.pop();
      inventory.summaryLimited = true;
      break;
    }
  }
  // Search grants survive checkpoint recovery even if their tool exchange was
  // compacted. Keep their typed identities available without treating them as reads.
  for (const { resource, parent } of [...state.grants].reverse()) {
    if (
      parent ||
      state.roots.some((root) => root.type === resource.type && root.id === resource.id) ||
      knowledge.unavailable.includes(`${resource.type}:${resource.id}`)
    )
      continue;
    inventory.discovered.push(resource);
    if (!fits()) {
      inventory.discovered.pop();
      inventory.summaryLimited = true;
      break;
    }
  }
  for (const inspection of [...knowledge.inspections].reverse()) {
    const entry = {
      databaseId: inspection.input.id,
      dataSourceId: inspection.input.dataSourceId,
      section: inspection.input.section,
      revision: inspection.revision,
      entries: (inspection.result.entries ?? [])
        .slice(0, 20)
        .map((item: Record<string, unknown>) => ({
          kind: item.kind,
          propertyId:
            item.propertyId ?? (inspection.input.section === "properties" ? item.id : undefined),
          viewId: item.viewId ?? (inspection.input.section === "views" ? item.id : undefined),
          name: item.name,
          type: item.type,
        })),
      complete: inspection.result.coverage?.complete,
    };
    inventory.inspections.push(entry);
    if (!fits()) {
      inventory.inspections.pop();
      inventory.summaryLimited = true;
    }
  }
  for (const read of [...knowledge.reads].reverse()) {
    inventory.reads.push(read);
    if (!fits()) {
      inventory.reads.pop();
      inventory.summaryLimited = true;
      break;
    }
  }
  for (const [key, read] of Object.entries(state.pending)) {
    inventory.pending[key] = read;
    if (!fits()) {
      delete inventory.pending[key];
      inventory.summaryLimited = true;
      break;
    }
  }
  return JSON.stringify(inventory);
}

/** Work must be a real pending cursor or an unread, discovered source/page, not merely a stop label. */
export function hasRemainingReads(state: AgentState) {
  if (Object.keys(state.pending).length) return true;
  const knowledge = state.knowledge;
  if (!knowledge) return false;
  if (
    knowledge.sources.some(
      (source) =>
        !source.recordsRead &&
        !knowledge.unavailable.includes(`database:${source.databaseId}`) &&
        !knowledge.unavailable.includes(`source:${source.databaseId}:${source.dataSourceId}`),
    )
  )
    return true;
  return state.grants.some(({ resource, parent }) => {
    if (
      knowledge.unavailable.includes(`${resource.type}:${resource.id}`) ||
      (parent && knowledge.unavailable.includes(`${parent.type}:${parent.id}`))
    )
      return false;
    if (resource.type === "page")
      return !knowledge.reads.some(
        (read) => read.tool === "read_page" && read.resource.id === resource.id && read.complete,
      );
    return !knowledge.reads.some(
      (entry) =>
        entry.tool === "describe_source" &&
        entry.resource.type === "database" &&
        entry.resource.id === resource.id &&
        !entry.dataSourceId &&
        entry.section === "sources" &&
        entry.complete,
    );
  });
}

/** Retain only metadata exchanges whose exact revision still has a validated inspection. */
export function pruneStaleInspections(messages: ModelMessage[], state: AgentState) {
  const calls = new Map<string, InspectionInput>();
  const stale = new Set<string>();
  for (const message of messages) {
    if (typeof message.content === "string") continue;
    for (const part of message.content) {
      if (
        part.type === "tool-call" &&
        part.toolName === "describe_source" &&
        part.input &&
        typeof part.input === "object"
      ) {
        const input = part.input as Record<string, unknown>;
        if (input.type === "database")
          calls.set(part.toolCallId, {
            type: "database",
            id: String(input.id),
            dataSourceId: typeof input.dataSourceId === "string" ? input.dataSourceId : null,
            section: String(input.section ?? "sources"),
            cursor: typeof input.cursor === "string" ? input.cursor : null,
          });
      }
      if (part.type === "tool-result" && part.output.type === "json") {
        const input = calls.get(part.toolCallId);
        const result = part.output.value as Record<string, unknown> | null;
        if (
          input &&
          result &&
          !result.error &&
          !state.knowledge!.inspections.some(
            (entry) =>
              entry.key === inspectionKey(input) && entry.revision === String(result.revision),
          )
        )
          stale.add(part.toolCallId);
      }
    }
  }
  const result: ModelMessage[] = [];
  for (const message of messages) {
    if (
      typeof message.content === "string" ||
      (message.role !== "assistant" && message.role !== "tool")
    ) {
      result.push(message);
      continue;
    }
    const removesMetadata = message.content.some(
      (part) =>
        (part.type === "tool-call" || part.type === "tool-result") && stale.has(part.toolCallId),
    );
    if (!removesMetadata) {
      result.push(message);
      continue;
    }
    if (message.role === "assistant") {
      const content = message.content.filter(
        (part) => part.type === "tool-call" && !stale.has(part.toolCallId),
      );
      if (content.length) result.push({ ...message, content });
    } else {
      const content = message.content.filter(
        (part) => part.type !== "tool-result" || !stale.has(part.toolCallId),
      );
      if (content.length) result.push({ ...message, content });
    }
  }
  return { messages: result, omitted: stale.size };
}
