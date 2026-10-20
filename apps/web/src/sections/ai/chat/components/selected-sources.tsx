// Sources activity: https://ui.shadcn.com/docs/ai-elements/radix/sources
// Context is user-selected today. This must never be labelled workspace search.
import type { ChatMessage } from "@zilobase/features/ai";
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
import { CircleCheckIcon } from "@/components/icons";
import { AnswerSources } from "./answer-sources";

export function SelectedSources({ message }: { message: ChatMessage }) {
  if (message.role !== "assistant" || !message.context || !message.roots?.length) return null;
  const context = message.context;
  const selected = context.manifest.filter(
    (entry) =>
      message.roots?.some((root) => root.type === entry.type && root.id === entry.id) &&
      (entry.pageId || entry.databaseId),
  );
  if (!selected.length) return null;
  return (
    <Trace aria-label="Selected sources activity">
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceIcon>
              <CircleCheckIcon />
            </TraceIcon>
            <TraceTitle>
              {selected.length} selected {selected.length === 1 ? "source" : "sources"}
            </TraceTitle>
            {context.status === "partial" && <TraceDescription>Partial context</TraceDescription>}
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <p className="text-xs">Context from the pages and databases attached to this message.</p>
          <AnswerSources citations={selected} label="Selected source links" />
          {context.omissions.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
              {context.omissions.map((omission, index) => (
                <li key={index}>{omission}</li>
              ))}
            </ul>
          )}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
