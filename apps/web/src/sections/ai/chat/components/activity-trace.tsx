// Trace-based shadcn patterns: task, plan, queue, reasoning, chain-of-thought,
// subagent and tool. https://ui.shadcn.com/docs/ai-elements
import { useState, type ReactNode } from "react";
import { CircleAlertIcon, CircleCheckIcon, CircleIcon, Loader2Icon } from "@/components/icons";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import type { ActivityStatus, ActivityStep } from "../lib/agent-activity";

export function ActivityLine({
  title,
  status,
  description,
}: {
  title: string;
  status: ActivityStatus;
  description?: string;
}) {
  return (
    <TraceLine
      status={
        status === "running"
          ? "running"
          : status === "failed"
            ? "error"
            : status === "pending" || status === "stopped"
              ? "pending"
              : undefined
      }
    >
      <TraceIcon>
        {status === "running" ? (
          <Loader2Icon className="motion-safe:animate-spin" />
        ) : status === "failed" ? (
          <CircleAlertIcon />
        ) : status === "completed" ? (
          <CircleCheckIcon />
        ) : (
          <CircleIcon />
        )}
      </TraceIcon>
      <TraceTitle>{title}</TraceTitle>
      {description && <TraceDescription>{description}</TraceDescription>}
      <span className="sr-only">{status}</span>
    </TraceLine>
  );
}

export function ActivityDisclosure({
  title,
  status,
  description,
  defaultOpen,
  children,
}: {
  title: string;
  status: ActivityStatus;
  description?: string;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState<boolean>();
  if (!children) return <ActivityLine title={title} status={status} description={description} />;
  return (
    <TraceCollapsible open={open ?? defaultOpen ?? status === "running"} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>
        <ActivityLine title={title} status={status} description={description} />
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>{children}</TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

export function ActivitySteps({
  type,
  title,
  status,
  steps,
}: {
  type: "task" | "plan" | "queue";
  title: string;
  status: ActivityStatus;
  steps: ActivityStep[];
}) {
  const completed = steps.filter((step) => step.status === "completed");
  const remaining = steps.filter((step) => step.status !== "completed");
  const rows = (items: ActivityStep[]) => (
    <Trace>
      {items.map((step) => (
        <ActivityLine key={step.id} title={step.title} status={step.status} />
      ))}
    </Trace>
  );
  return (
    <ActivityDisclosure
      title={title}
      status={status}
      description={`${completed.length} of ${steps.length} done`}
      defaultOpen={type !== "task" || status === "running"}
    >
      {type === "queue" ? (
        <Trace>
          {remaining.length > 0 && (
            <ActivityDisclosure title={`${remaining.length} to do`} status={status} defaultOpen>
              {rows(remaining)}
            </ActivityDisclosure>
          )}
          {completed.length > 0 && (
            <ActivityDisclosure title={`${completed.length} completed`} status="completed">
              {rows(completed)}
            </ActivityDisclosure>
          )}
        </Trace>
      ) : (
        rows(steps)
      )}
    </ActivityDisclosure>
  );
}
