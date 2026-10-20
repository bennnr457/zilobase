// Terminal, test-results and stack-trace patterns:
// https://ui.shadcn.com/docs/ai-elements/radix/terminal
// https://ui.shadcn.com/docs/ai-elements/radix/test-results
// https://ui.shadcn.com/docs/ai-elements/radix/stack-trace
import { CodeBlock, CodeBlockContent } from "@/components/ui/shadcn-code-block";
import { Trace } from "@/components/ui/trace";
import { ActivityDisclosure, ActivityLine } from "./activity-trace";
import type { AgentActivity } from "../lib/agent-activity";

export function ActivityOutput({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <CodeBlock size="sm" variant={error ? "destructive" : "default"}>
      <CodeBlockContent wrap className="max-h-64">
        {text}
      </CodeBlockContent>
    </CodeBlock>
  );
}

export function ActivityTerminal({
  activity,
}: {
  activity: Extract<AgentActivity, { type: "terminal" }>;
}) {
  const failed =
    activity.status === "failed" || (activity.exitCode !== undefined && activity.exitCode !== 0);
  return (
    <ActivityDisclosure
      title={activity.command}
      status={failed ? "failed" : activity.status}
      description={activity.exitCode !== undefined ? `Exit ${activity.exitCode}` : undefined}
    >
      <ActivityOutput text={activity.output} error={failed} />
    </ActivityDisclosure>
  );
}

export function ActivityTests({
  activity,
}: {
  activity: Extract<AgentActivity, { type: "test-results" }>;
}) {
  const tests = activity.suites.flatMap((suite) => suite.tests);
  const failed = tests.filter((test) => test.status === "failed").length;
  const skipped = tests.filter((test) => test.status === "skipped").length;
  return (
    <ActivityDisclosure
      title={activity.title}
      status={failed ? "failed" : activity.status}
      description={`${tests.length} tests, ${failed} failed, ${skipped} skipped`}
      defaultOpen={failed > 0}
    >
      <Trace>
        {activity.suites.map((suite) => (
          <ActivityDisclosure
            key={suite.id}
            title={suite.name}
            status={
              suite.tests.some((test) => test.status === "failed") ? "failed" : activity.status
            }
            defaultOpen={suite.tests.some((test) => test.status === "failed")}
          >
            <Trace>
              {suite.tests.map((test) =>
                test.status === "failed" ? (
                  <ActivityDisclosure key={test.id} title={test.name} status="failed" defaultOpen>
                    <ActivityOutput text={test.error ?? "Test failed"} error />
                  </ActivityDisclosure>
                ) : (
                  <ActivityLine
                    key={test.id}
                    title={test.name}
                    status={test.status === "skipped" ? "pending" : "completed"}
                    description={test.status === "skipped" ? "Skipped" : undefined}
                  />
                ),
              )}
            </Trace>
          </ActivityDisclosure>
        ))}
      </Trace>
    </ActivityDisclosure>
  );
}

export function ActivityStackTrace({
  activity,
}: {
  activity: Extract<AgentActivity, { type: "stack-trace" }>;
}) {
  const [error, ...frames] = activity.stack.split("\n");
  const internal = frames.filter((line) => /node_modules|node:/.test(line));
  const application = frames.filter((line) => !/node_modules|node:/.test(line));
  return (
    <ActivityDisclosure title={activity.title} status="failed" defaultOpen>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="font-mono text-xs text-action-danger-text">{error}</p>
        {application.length > 0 && <ActivityOutput text={application.join("\n")} error />}
        {internal.length > 0 && (
          <ActivityDisclosure title={`${internal.length} framework frames`} status="completed">
            <ActivityOutput text={internal.join("\n")} />
          </ActivityDisclosure>
        )}
      </div>
    </ActivityDisclosure>
  );
}
