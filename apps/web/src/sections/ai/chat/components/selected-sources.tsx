import type { ChatMessage } from "@zilobase/features/ai";
import { AnswerSources } from "./answer-sources";
import { groupSourceReads } from "./read-activity";

export function SelectedSources({ message }: { message: ChatMessage }) {
  if (message.role !== "assistant" || !message.context || !message.roots?.length) return null;
  const reading = groupSourceReads(message);
  const selected = message.context.manifest.filter(
    (entry) =>
      message.roots?.some((root) => root.type === entry.type && root.id === entry.id) &&
      !reading.some((group) => group.source?.type === entry.type && group.source.id === entry.id) &&
      (entry.pageId || entry.databaseId),
  );
  if (!selected.length) return null;
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-content-secondary"
      aria-label="Selected sources activity"
    >
      <span>Attached</span>
      <AnswerSources citations={selected} label="Selected source links" className="mt-0" />
    </div>
  );
}
