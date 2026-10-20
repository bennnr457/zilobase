// https://ui.shadcn.com/docs/ai-elements/radix/context
// https://ui.shadcn.com/docs/ai-elements/radix/inline-citation
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Progress } from "@/components/ui/progress";

export function MessageContextUsage({
  input,
  output,
  reasoning = 0,
  limit,
}: {
  input: number;
  output: number;
  reasoning?: number;
  limit: number;
}) {
  if (
    limit <= 0 ||
    ![input, output, reasoning, limit].every((value) => Number.isFinite(value) && value >= 0)
  )
    return null;
  const used = input + output + reasoning;
  const percent = Math.min(100, Math.round((used / limit) * 100));
  return (
    <HoverCard openDelay={100}>
      <HoverCardTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          {percent}% context
        </Button>
      </HoverCardTrigger>
      <HoverCardContent
        className="flex max-w-[calc(100vw-2rem)] flex-col gap-3"
        aria-label="Context usage"
      >
        <div className="flex justify-between gap-2">
          <span>Context</span>
          <span>
            {used.toLocaleString()} / {limit.toLocaleString()}
          </span>
        </div>
        <Progress value={percent} aria-label="Context used" />
        {Object.entries({ Input: input, Output: output, Reasoning: reasoning }).map(
          ([label, value]) => (
            <div key={label} className="flex justify-between gap-2">
              <span>{label}</span>
              <span>{value.toLocaleString()}</span>
            </div>
          ),
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

export function MessageInlineCitation({
  title,
  href,
  description,
  children,
}: {
  title: string;
  href: string;
  description?: string;
  children: ReactNode;
}) {
  // Resolved/authorized source URLs only; never turn arbitrary tool output into
  // executable links. Workspace navigation can instead supply AnswerSources.
  const safeHref = /^(https?:\/\/|\/(?!\/)|#)/i.test(href) ? href : undefined;
  if (!safeHref) return <span>{children}</span>;
  return (
    <HoverCard openDelay={100}>
      <HoverCardTrigger asChild>
        <a
          href={safeHref}
          aria-label={title}
          className="inline-flex rounded-sm bg-surface-secondary px-1 text-xs text-content-secondary underline-offset-2 hover:underline"
        >
          {children}
        </a>
      </HoverCardTrigger>
      <HoverCardContent className="max-w-[calc(100vw-2rem)]">
        <p className="font-medium">{title}</p>
        {description && <p className="mt-1 text-content-secondary">{description}</p>}
      </HoverCardContent>
    </HoverCard>
  );
}
