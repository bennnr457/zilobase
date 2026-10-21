import { expect, test } from "vitest";
import { createAgentState, updateReadCoverage } from "./agent-state";
import {
  agentKnowledgeSummary,
  hasRemainingReads,
  rememberInspection,
  rememberRead,
  restoreAgentKnowledge,
  pruneStaleInspections,
  forgetDatabaseKnowledge,
} from "./agent-memory";
import { compactAgentMessages } from "./agent";

const stateFor = () =>
  createAgentState(
    "workspace",
    [{ type: "database", id: "db" }],
    [{ role: "user", content: "Summarize [[database:db]]" }],
  );
const input = {
  type: "database" as const,
  id: "db",
  dataSourceId: null,
  section: "sources",
  cursor: null,
};
const sources = {
  revision: "v1",
  entries: [{ kind: "data_source", dataSourceId: "source", name: "Project" }],
  coverage: { complete: true, returned: 1 },
  continuation: { nextCursor: null },
};

test("source identities and unfinished reads survive transcript compaction", () => {
  const state = stateFor();
  rememberInspection(state, input, sources);
  state.messages.push(
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "c", toolName: "describe_source", input }],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "c",
          toolName: "describe_source",
          output: { type: "json", value: sources },
        },
      ],
    },
    { role: "assistant", content: "Later exchange" },
  );
  state.messages = compactAgentMessages(state.messages, 100).messages;
  const inventory = JSON.parse(agentKnowledgeSummary(state));
  expect(inventory.sources[0]).toMatchObject({
    databaseId: "db",
    dataSourceId: "source",
    recordsRead: false,
  });
  expect(hasRemainingReads(state)).toBe(true);
  rememberRead(state, "query_records", { type: "database", id: "db" }, true, 0, "source");
  state.progress.stopReason = "step_budget";
  updateReadCoverage(state);
  expect(state.progress.canContinue).toBe(false);
});

test("legacy v2 metadata normalizes using its originating call, without page grants", () => {
  const state = stateFor();
  delete state.knowledge;
  state.messages.push(
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "legacy", toolName: "describe_source", input }],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "legacy",
          toolName: "describe_source",
          output: {
            type: "json",
            value: { ...sources, entries: [{ id: "source", name: "Project" }] },
          },
        },
      ],
    },
  );
  restoreAgentKnowledge(state);
  expect(state.knowledge!.inspections[0].result.entries![0]).toEqual({
    kind: "data_source",
    dataSourceId: "source",
    databaseId: "db",
    name: "Project",
  });
  expect(state.grants).toHaveLength(1);
});

test("bounded inventory reports its source limit instead of silently claiming complete recall", () => {
  const state = stateFor();
  rememberInspection(state, input, {
    ...sources,
    entries: Array.from({ length: 101 }, (_, i) => ({
      dataSourceId: `s${i}`,
      name: "x".repeat(128),
    })),
  });
  expect(state.knowledge!.sources).toHaveLength(100);
  expect(state.progress.stopReason).toBe("memory_budget");
  expect(Buffer.byteLength(agentKnowledgeSummary(state))).toBeLessThanOrEqual(6000);
  expect(JSON.parse(agentKnowledgeSummary(state)).inventoryLimited).toBe(true);
});

test("a properties inspection cannot imply that database source discovery is complete", () => {
  const state = stateFor();
  rememberInspection(state, { ...input, section: "properties" }, { ...sources, entries: [] });
  expect(hasRemainingReads(state)).toBe(true);
});

test("a revision change removes stale metadata calls and matching results before replay", () => {
  const state = stateFor();
  rememberInspection(state, input, sources);
  state.messages.push(
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "stale", toolName: "describe_source", input }],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "stale",
          toolName: "describe_source",
          output: { type: "json", value: sources },
        },
      ],
    },
  );
  expect(pruneStaleInspections(state.messages, state).omitted).toBe(0);
  forgetDatabaseKnowledge(state, "db");
  const clean = pruneStaleInspections(state.messages, state);
  expect(clean.omitted).toBe(1);
  expect(clean.messages).toEqual([state.messages[0]]);
});
