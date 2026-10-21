import type { ChatMessage, ChatToolActivity } from "@zilobase/features/ai";
import { Trace } from "@/components/ui/trace";
import { ActivityDisclosure } from "./activity-trace";
import { AnswerSources } from "./answer-sources";

type ReadGroup = {
  id: string;
  source?: ChatToolActivity["source"];
  calls: ChatToolActivity[];
};

// Pagination advances a source's reading state instead of adding another tool row.
export function groupSourceReads(message: ChatMessage) {
  const groups = new Map<string, ReadGroup>();
  const unique = new Map(message.progress?.activities.map((activity) => [activity.id, activity]));
  for (const activity of unique.values()) {
    const candidates = message.context?.manifest.filter((entry) => entry.type === "page");
    // Older saved runs have no source association. Resolve only an unambiguous
    // completed page read; never guess between selected or discovered pages.
    const legacySource =
      activity.name === "read_page" && activity.status === "completed" && candidates?.length === 1
        ? { type: "page" as const, id: candidates[0]!.id }
        : undefined;
    const source: ChatToolActivity["source"] = activity.source ?? legacySource;
    const id = source
      ? `${activity.name}:${source.type}:${source.id}:${source.dataSourceId ?? ""}`
      : activity.id;
    const group = groups.get(id) ?? { id, source, calls: [] };
    group.calls.push(activity);
    groups.set(id, group);
  }
  return [...groups.values()];
}

function readLabel(activity: ChatToolActivity, active: boolean) {
  if (activity.status === "failed") return "Couldn't read source";
  if (activity.cached && activity.status === "completed") return "Source reused";
  if (activity.status === "running") {
    if (!active) return "Reading stopped";
    return {
      read_page: "Reading page",
      describe_source: "Inspecting source",
      query_records: "Reading records",
      read_record: "Reading record",
      aggregate_records: "Calculating totals",
    }[activity.name];
  }
  switch (activity.name) {
    case "read_page":
      return activity.hasMore ? "Partially read" : "Page read";
    case "describe_source":
      return activity.hasMore ? "Partially inspected" : "Source inspected";
    case "query_records":
      return "Records read";
    case "read_record":
      return "Record read";
    case "aggregate_records":
      return "Totals calculated";
  }
}

export function ReadActivity({ message, active }: { message: ChatMessage; active: boolean }) {
  const groups = groupSourceReads(message);
  if (!groups.length) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2" aria-label="Source reading activity">
      {groups.map((group) => {
        const latest = group.calls.at(-1)!;
        const running = active && group.calls.some((call) => call.status === "running");
        const activity = running
          ? [...group.calls].reverse().find((call) => call.status === "running")!
          : latest;
        const status = activity.status === "running" && !active ? "stopped" : activity.status;
        const source = group.source;
        const entry = message.context?.manifest.find(
          (entry) => entry.type === source?.type && entry.id === source.id,
        );
        const link =
          entry ??
          (source
            ? {
                key: `${source.type}:${source.id}`,
                title: source.type === "page" ? "Page" : "Database",
                ...(source.type === "page" ? { pageId: source.id } : { databaseId: source.id }),
              }
            : undefined);
        const records =
          latest.name === "query_records"
            ? group.calls.reduce((sum, call) => sum + (call.returned ?? 0), 0)
            : undefined;
        const morePageContent =
          latest.hasMore ??
          [...group.calls].reverse().find((call) => call.status === "completed")?.hasMore;
        const detail =
          status === "failed"
            ? "This source couldn't be read."
            : status === "stopped"
              ? "The read didn't finish."
              : latest.name === "read_page" && morePageContent
                ? running
                  ? "Reading more of this page"
                  : "More of this page is available"
                : records !== undefined && status === "completed"
                  ? `${records} ${records === 1 ? "record" : "records"}${latest.hasMore ? " · more available" : ""}`
                  : undefined;
        return (
          <Trace
            key={group.id}
            data-ai-read-source={source ? `${source.type}:${source.id}` : undefined}
            data-read-status={status}
          >
            <ActivityDisclosure title={readLabel(activity, active)} status={status}>
              {link && (
                <AnswerSources
                  citations={[link]}
                  label="Read source link"
                  className="mt-0 max-w-full"
                />
              )}
              {detail && <p className="mt-1.5 text-xs text-content-secondary">{detail}</p>}
              {!link && !detail && <p className="text-xs">Source details are unavailable.</p>}
            </ActivityDisclosure>
          </Trace>
        );
      })}
    </div>
  );
}
