// Presentation models for shadcn's AI patterns. These are NOT transport events.
// Future tools must first add authorized, validated, versioned events and durable
// replay in the shared client/server. Map those events by stable activity id into
// this view model, then pass activityByMessage to ChatbotMessages. A snapshot
// replaces an activity; text deltas must not create duplicate activity rows.
// Only provider-supplied public reasoning summaries may populate reasoning.
// Selected-source context today is rendered separately and never implies search.
//
// Future implementation passes (each independently buildable):
// 1. Add authorized server workspace search/read tools, citation provenance and
//    explicit capability metadata. Keep current selected roots as user context.
// 2. Add bounded discriminated activity schemas to the shared run protocol;
//    persist stable ids, ordering, deltas and terminal states for replay/resume.
//    Carry workspace/session/revision guards through every activity update.
// 3. Project those validated events into activityByMessage; reconcile snapshots
//    by id, stop all running rows on terminal events and preserve source links.
// 4. Enable approval/checkpoint/model commands only with server authorization,
//    idempotency and acknowledgement. Verify cancellation, reconnect, reload,
//    late events, workspace switching and narrow layouts before enabling them.
export type ActivityStatus = "pending" | "running" | "completed" | "failed" | "stopped";
export type ActivityStep = { id: string; title: string; status: ActivityStatus };
type ActivityBase = { id: string; title: string; status: ActivityStatus };

export type AgentActivity = ActivityBase &
  (
    | { type: "reasoning"; text?: string; durationMs?: number }
    | { type: "task" | "plan" | "queue"; steps: ActivityStep[] }
    | { type: "chain-of-thought" | "subagent"; children: AgentActivity[]; summary?: string }
    | { type: "tool"; input?: string; output?: string; error?: string }
    | { type: "terminal"; command: string; output: string; exitCode?: number }
    | {
        type: "test-results";
        suites: Array<{
          id: string;
          name: string;
          tests: Array<{
            id: string;
            name: string;
            status: "passed" | "failed" | "skipped";
            error?: string;
          }>;
        }>;
      }
    | { type: "stack-trace"; stack: string }
    | { type: "confirmation"; description: string; decision?: "approved" | "denied" }
    | { type: "checkpoint"; canRestore: boolean }
    | { type: "file-tree"; files: ActivityFile[]; selectedPath?: string }
  );

export type ActivityFile = { path: string; name: string } & (
  | { type: "file" }
  | { type: "folder"; children: ActivityFile[] }
);

// Supply commands only when the backend supports and authorizes the capability.
// The renderer never performs tool execution, approval or history mutation itself.
export type ActivityActions = {
  onApproval?: (id: string, approved: boolean) => void;
  onRestore?: (id: string) => void;
  onOpenFile?: (path: string) => void;
};
