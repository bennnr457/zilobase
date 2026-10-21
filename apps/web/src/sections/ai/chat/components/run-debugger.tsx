import { useState } from "react";
import { BugIcon, DownloadIcon, RefreshCwIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useChatRunDebug } from "@zilobase/features/ai/react";
import type { ChatDebugEvent, ChatMessage } from "@zilobase/features/ai";

export function RunDebugger({
  workspaceId,
  message,
}: {
  workspaceId: string;
  message: ChatMessage;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-content-secondary"
          aria-label="Debug AI run"
        >
          <BugIcon /> Debug run
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full! sm:max-w-3xl!">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>AI run debugger</SheetTitle>
          <SheetDescription>
            Live execution events, model requests, tool arguments and returned source data.
          </SheetDescription>
        </SheetHeader>
        {open && (
          <RunDebugContent
            key={`${workspaceId}:${message.runId ?? message.id}`}
            workspaceId={workspaceId}
            message={message}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function RunDebugContent({ workspaceId, message }: { workspaceId: string; message: ChatMessage }) {
  const [filter, setFilter] = useState("");
  const query = useChatRunDebug(workspaceId, message.runId ?? "", !!message.runId);
  // A later authorization failure must hide previously fetched payloads immediately.
  const data = message.runId
    ? query.isError
      ? undefined
      : query.data
    : message.debug
      ? {
          runId: message.id,
          status:
            message.status === "streaming" ? ("running" as const) : (message.status ?? "completed"),
          model: null,
          expiresAt: null,
          available: true,
          ...message.debug,
        }
      : undefined;
  const events =
    data?.events.filter((event) =>
      `${event.type} ${event.tool ?? ""} ${event.toolCallId ?? ""} ${event.payload}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    ) ?? [];
  const exportData = () => ({ ...data, answer: message.text, progress: message.progress });
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `ask-ai-${message.runId ?? message.id}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-xs text-content-secondary" role="status">
          {data
            ? `${data.status}${message.progress?.stopReason ? ` · ${message.progress.stopReason}` : ""} · ${data.events.length} ${data.events.length === 1 ? "event" : "events"}${data.model ? ` · ${data.model}` : ""}`
            : query.isPending && message.runId
              ? "Loading run log…"
              : "Run log unavailable"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={!message.runId || query.isFetching}
          aria-label="Refresh run log"
        >
          <RefreshCwIcon />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!data?.available}
          onClick={download}
        >
          <DownloadIcon /> Download JSON
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!data?.available}
          onClick={() => console.info("[Ask AI run]", exportData())}
        >
          Log to console
        </Button>
      </div>
      <Input
        aria-label="Filter run events"
        placeholder="Filter events, tools or content…"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      {!message.runId && message.debug && (
        <p className="text-xs text-content-secondary">
          This live log is available until the conversation is reloaded. Download JSON to keep it.
        </p>
      )}
      {data?.expiresAt && (
        <p className="text-xs text-content-secondary">
          Raw logs expire {new Date(data.expiresAt).toLocaleString()}.
        </p>
      )}
      {query.isError && (
        <p role="alert" className="text-sm text-action-danger-text">
          {query.error instanceof Error
            ? query.error.message
            : "Could not load this run. Check your access and retry."}
        </p>
      )}
      {!message.runId && !message.debug && (
        <p className="text-sm text-content-secondary">
          This answer has no captured run log. Send a new message to capture execution events.
        </p>
      )}
      {data && !data.available && (
        <p className="text-sm text-content-secondary">
          This run’s raw log has expired or was created before debugging was available.
        </p>
      )}
      {!!data?.omitted && (
        <p className="text-sm text-content-secondary">
          {data.omitted} events omitted because the log reached its size limit.
        </p>
      )}
      <ol
        aria-label="Run events"
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain"
      >
        {events.map((event) => (
          <DebugEvent key={event.id} event={event} />
        ))}
        {data?.available && !events.length && (
          <li className="py-4 text-sm text-content-secondary">
            {data.events.length
              ? "No events match your filter."
              : ["running", "queued"].includes(data.status)
                ? "Waiting for the next execution checkpoint…"
                : "No events were captured."}
          </li>
        )}
      </ol>
    </div>
  );
}

function DebugEvent({ event }: { event: ChatDebugEvent }) {
  let payload = event.payload;
  try {
    payload = JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    /* Truncated payloads remain readable as raw text. */
  }
  return (
    <li>
      <details className="rounded-lg border border-stroke-default bg-surface-canvas">
        <summary className="cursor-pointer px-3 py-2 text-xs">
          <span className="font-mono">
            {event.id}. {event.type}
            {event.tool ? ` · ${event.tool}` : ""}
          </span>
          <span className="ml-2 text-content-secondary">
            Step {event.step} · {new Date(event.at).toLocaleTimeString()}
            {event.durationMs !== undefined ? ` · ${Math.round(event.durationMs)} ms` : ""}
          </span>
        </summary>
        <div className="border-t border-stroke-default p-3">
          {event.toolCallId && (
            <p className="mb-2 font-mono text-xs text-content-secondary">
              Call: {event.toolCallId}
            </p>
          )}
          {event.truncated && (
            <p className="mb-2 text-xs text-content-secondary">
              Payload truncated at the per-event size limit.
            </p>
          )}
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5">
            {payload}
          </pre>
        </div>
      </details>
    </li>
  );
}
