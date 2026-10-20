import { useState } from "react";
import MessageActivity from "@/sections/ai/chat/components/message-activity";
import {
  MessageContextUsage,
  MessageInlineCitation,
} from "@/sections/ai/chat/components/message-context";
import { ModelSelector } from "@/sections/ai/composer/components/model-selector";
import type { AgentActivity, ActivityStep } from "@/sections/ai/chat/lib/agent-activity";
import { Button } from "@/components/ui/button";

const steps: ActivityStep[] = [
  { id: "first", title: "Read selected documents", status: "completed" },
  { id: "second", title: "Summarize findings", status: "running" },
  { id: "third", title: "Review answer", status: "pending" },
];
const initial: AgentActivity[] = [
  {
    id: "reasoning",
    type: "reasoning",
    title: "Reasoning summary",
    status: "running",
    text: "Provider-supplied public summary.",
  },
  ...(["task", "plan", "queue"] as const).map((type) => ({
    id: type,
    type,
    title: `${type} activity`,
    status: "running" as const,
    steps,
  })),
  {
    id: "chain",
    type: "chain-of-thought",
    title: "Research activity",
    status: "running",
    children: [
      {
        id: "search",
        type: "tool",
        title: "Search workspace",
        status: "completed",
        input: '{"query":"plan"}',
        output: "One authorized result",
      },
    ],
  },
  {
    id: "subagent",
    type: "subagent",
    title: "Research assistant",
    status: "running",
    summary: "Delegated summary",
    children: [
      {
        id: "read",
        type: "tool",
        title: "Read document",
        status: "completed",
        output: "Document text",
      },
    ],
  },
  {
    id: "tool",
    type: "tool",
    title: "Read selected page",
    status: "completed",
    input: '{"pageId":"main"}',
    output: "<literal> page content",
  },
  {
    id: "terminal",
    type: "terminal",
    title: "Build",
    status: "completed",
    command: "npm run build",
    output: "Build succeeded\n",
    exitCode: 0,
  },
  {
    id: "tests",
    type: "test-results",
    title: "Run tests",
    status: "failed",
    suites: [
      {
        id: "suite",
        name: "context.test.ts",
        tests: [
          { id: "pass", name: "authorized context", status: "passed" },
          {
            id: "fail",
            name: "missing source",
            status: "failed",
            error: "Expected source to exist",
          },
          { id: "skip", name: "optional provider", status: "skipped" },
        ],
      },
    ],
  },
  {
    id: "stack",
    type: "stack-trace",
    title: "Command failed",
    status: "failed",
    stack: "Error: source missing\n at read (src/context.ts:12:3)\n at run (node:internal:1:1)",
  },
  {
    id: "confirmation",
    type: "confirmation",
    title: "Update this page?",
    status: "pending",
    description: "The tool requests permission to update the selected page.",
  },
  {
    id: "checkpoint",
    type: "checkpoint",
    title: "Before update",
    status: "completed",
    canRestore: true,
  },
  {
    id: "files",
    type: "file-tree",
    title: "Changed files",
    status: "completed",
    files: [
      {
        type: "folder",
        path: "src",
        name: "src",
        children: [{ type: "file", path: "src/context.ts", name: "context.ts" }],
      },
    ],
  },
];

export function AiPatternsFixture() {
  const [activities, setActivities] = useState(initial);
  const [model, setModel] = useState("first");
  const [action, setAction] = useState("");
  const [capabilities, setCapabilities] = useState(true);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <h1>AI pattern catalog</h1>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setCapabilities(!capabilities)}>Toggle capabilities</Button>
        <Button
          onClick={() =>
            setActivities((current) =>
              current.map((activity) =>
                activity.id === "reasoning"
                  ? { ...activity, status: "completed", durationMs: 2400 }
                  : activity,
              ),
            )
          }
        >
          Complete reasoning
        </Button>
        <Button
          onClick={() =>
            setActivities((current) =>
              current.map((activity) =>
                activity.id === "task" && activity.type === "task"
                  ? {
                      ...activity,
                      status: "completed",
                      steps: activity.steps.map((step) => ({ ...step, status: "completed" })),
                    }
                  : activity,
              ),
            )
          }
        >
          Complete task
        </Button>
      </div>
      <MessageActivity
        activities={activities}
        actions={
          capabilities
            ? {
                onApproval: (id, approved) => {
                  setAction(`${id}:${approved}`);
                  setActivities((current) =>
                    current.map((activity) =>
                      activity.id === id && activity.type === "confirmation"
                        ? {
                            ...activity,
                            decision: approved ? "approved" : "denied",
                            status: "completed",
                          }
                        : activity,
                    ),
                  );
                },
                onRestore: (id) => setAction(`restore:${id}`),
                onOpenFile: (path) => setAction(`file:${path}`),
              }
            : undefined
        }
      />
      <div data-ai-pattern="context">
        <MessageContextUsage input={800} output={100} reasoning={100} limit={10000} />
      </div>
      <div data-ai-pattern="inline-citation">
        <MessageInlineCitation
          title="Authorized reference"
          href="https://example.com/source"
          description="Reference excerpt"
        >
          [1]
        </MessageInlineCitation>{" "}
        <MessageInlineCitation title="Unsafe reference" href="javascript:alert(1)">
          Unsafe citation
        </MessageInlineCitation>
      </div>
      <div data-ai-pattern="model-selector">
        <ModelSelector
          models={[
            { id: "first", label: "First model", provider: "Provider A" },
            { id: "second", label: "Second model", provider: "Provider B" },
            {
              id: "unavailable",
              label: "Unavailable model",
              provider: "Provider C",
              disabled: true,
            },
          ]}
          value={model}
          onValueChange={setModel}
        />
      </div>
      <output aria-label="Last activity action">{action}</output>
    </div>
  );
}
