import { Trace } from "@/components/ui/trace";
import { ActivityDisclosure, ActivitySteps } from "./activity-trace";
import {
  ActivityOutput,
  ActivityStackTrace,
  ActivityTerminal,
  ActivityTests,
} from "./activity-output";
import { ActivityCheckpoint, ActivityConfirmation, ActivityFiles } from "./activity-interaction";
import type { ActivityActions, AgentActivity } from "../lib/agent-activity";

// Lazy-loaded only when an authorized activity view model is supplied. None of
// these patterns synthesize a tool call, reasoning, plan or progress for today's
// text-only transport. Grouped activity is the documented Chain of Thought UI.
export default function MessageActivity({
  activities,
  actions,
}: {
  activities: readonly AgentActivity[];
  actions?: ActivityActions;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3" aria-label="Assistant activity">
      {activities.map((activity) => (
        <div key={activity.id} data-ai-pattern={activity.type} data-activity-id={activity.id}>
          <ActivityRow activity={activity} actions={actions} />
        </div>
      ))}
    </div>
  );
}

function ActivityRow({
  activity,
  actions,
}: {
  activity: AgentActivity;
  actions?: ActivityActions;
}) {
  switch (activity.type) {
    case "reasoning":
      return (
        <Trace>
          <ActivityDisclosure
            title={activity.status === "running" ? "Thinking" : activity.title}
            status={activity.status}
            description={
              activity.durationMs !== undefined
                ? `${Math.round(activity.durationMs / 1000)}s`
                : undefined
            }
          >
            {activity.text ? (
              <p className="text-xs whitespace-pre-wrap">{activity.text}</p>
            ) : undefined}
          </ActivityDisclosure>
        </Trace>
      );
    case "task":
    case "plan":
    case "queue":
      return (
        <Trace>
          <ActivitySteps {...activity} />
        </Trace>
      );
    case "chain-of-thought":
    case "subagent":
      return (
        <Trace>
          <ActivityDisclosure
            title={activity.title}
            status={activity.status}
            description={`${activity.children.length} ${activity.children.length === 1 ? "step" : "steps"}`}
          >
            <div className="flex min-w-0 flex-col gap-3">
              <MessageActivity activities={activity.children} actions={actions} />
              {activity.summary && (
                <p className="text-xs whitespace-pre-wrap">{activity.summary}</p>
              )}
            </div>
          </ActivityDisclosure>
        </Trace>
      );
    case "tool":
      return (
        <Trace>
          <ActivityDisclosure
            title={activity.title}
            status={activity.error ? "failed" : activity.status}
          >
            {activity.input !== undefined || activity.output !== undefined || activity.error ? (
              <div className="flex min-w-0 flex-col gap-2">
                {activity.input !== undefined && (
                  <div>
                    <p className="mb-1 text-xs">Input</p>
                    <ActivityOutput text={activity.input} />
                  </div>
                )}
                {activity.output !== undefined && (
                  <div>
                    <p className="mb-1 text-xs">Output</p>
                    <ActivityOutput text={activity.output} />
                  </div>
                )}
                {activity.error && <ActivityOutput text={activity.error} error />}
              </div>
            ) : undefined}
          </ActivityDisclosure>
        </Trace>
      );
    case "terminal":
      return (
        <Trace>
          <ActivityTerminal activity={activity} />
        </Trace>
      );
    case "test-results":
      return (
        <Trace>
          <ActivityTests activity={activity} />
        </Trace>
      );
    case "stack-trace":
      return (
        <Trace>
          <ActivityStackTrace activity={activity} />
        </Trace>
      );
    case "confirmation":
      return <ActivityConfirmation activity={activity} onApproval={actions?.onApproval} />;
    case "checkpoint":
      return <ActivityCheckpoint activity={activity} onRestore={actions?.onRestore} />;
    case "file-tree":
      return (
        <ActivityFiles
          files={activity.files}
          selectedPath={activity.selectedPath}
          onOpenFile={actions?.onOpenFile}
        />
      );
    default: {
      const exhaustive: never = activity;
      return exhaustive;
    }
  }
}
