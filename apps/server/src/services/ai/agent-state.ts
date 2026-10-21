import type { ModelMessage } from "ai";
import type { ChatDebugLog, ChatReadProgress, ChatToolName } from "@zilobase/features/runtime";
import type { BuildContextResult, ResourceRef } from "@zilobase/page-context";
import { newAgentUsage, type AgentUsage } from "./budget";
import { newAgentKnowledge, hasRemainingReads, type AgentKnowledge } from "./agent-memory";

export type ReadCursor = {
  fingerprint: string;
  revision: unknown;
  position: unknown;
  expiresAt: number;
};
export type ReadGrant = { resource: ResourceRef; parent?: ResourceRef; sourceId?: string };
export type PendingRead = { name: ChatToolName; input: Record<string, unknown> };
export type AgentState = {
  version: 2;
  workspaceId: string;
  roots: ResourceRef[];
  task: string;
  grants: ReadGrant[];
  cursors: Record<string, ReadCursor>;
  pending: Record<string, PendingRead>;
  messages: ModelMessage[];
  context: BuildContextResult;
  progress: ChatReadProgress;
  debug?: ChatDebugLog;
  steps: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  chargedTokens: number;
  usage?: AgentUsage;
  knowledge?: AgentKnowledge;
  committedText: string;
  omittedResults: number;
  expiresAt: number;
};

export const emptyChatContext = (): BuildContextResult => ({
  version: 1,
  status: "complete",
  markdown: "",
  charCount: 0,
  manifest: [],
  omissions: [],
  trimmedAttachmentIds: [],
});

export function createAgentState(
  workspaceId: string,
  roots: ResourceRef[],
  messages: ModelMessage[],
): AgentState {
  return {
    version: 2,
    workspaceId,
    roots,
    task: String(messages.findLast((m) => m.role === "user")?.content ?? ""),
    grants: roots.map((resource) => ({ resource })),
    cursors: {},
    pending: {},
    messages,
    context: emptyChatContext(),
    progress: { activities: [], canContinue: false },
    steps: 0,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    chargedTokens: 0,
    usage: newAgentUsage(),
    knowledge: newAgentKnowledge(),
    committedText: "",
    omittedResults: 0,
    expiresAt: Date.now() + 3_600_000,
  };
}

export function updateReadCoverage(state: AgentState) {
  const count = Object.keys(state.pending).length;
  state.progress.canContinue =
    state.progress.stopReason !== "source_unavailable" &&
    (count > 0 || (!!state.progress.stopReason && hasRemainingReads(state)));
  state.context.omissions = [
    ...(count ? [`${count} source reads have additional pages. Results are not exhaustive.`] : []),
    ...(state.progress.stopReason
      ? [
          state.progress.stopReason === "memory_budget"
            ? "The retained source inventory reached its size limit. Narrow the sources for further reading."
            : state.progress.stopReason === "no_progress"
              ? "Repeated inspections returned no new information; retrieval stopped."
              : state.progress.stopReason === "source_unavailable"
                ? "A previously inspected source is no longer accessible."
                : `Reading reached the ${({ tool_budget: "tool call", step_budget: "model step", context_budget: "context", token_budget: "token" } as Record<string, string>)[state.progress.stopReason] ?? "run"} limit.`,
        ]
      : []),
    ...(state.omittedResults
      ? [
          `${state.omittedResults} older tool exchanges omitted from the current model context. Do not claim exhaustive recall.`,
        ]
      : []),
  ];
  state.context.status = state.context.omissions.length ? "partial" : "complete";
}
