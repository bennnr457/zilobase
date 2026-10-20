import {
  recordBackgroundCounter,
  recordBackgroundHistogram,
  backgroundAttributes,
} from "../../infrastructure/background/telemetry";
import type { ChatRunReceipt } from "@zilobase/features/runtime";
import type { ServerOperationContext } from "../../services/operations/context";
import { readChatRunPageInScope, isRunTerminal } from "../../services/ai/runs";

/** Subscriber lifetime only. The producer is owned by a background dispatch. */
export function chatRunResponse(
  context: ServerOperationContext,
  receipt: ChatRunReceipt,
  after: number,
  lifetimeMs = 20_000,
) {
  const encoder = new TextEncoder();
  let cursor = after;
  let cancelled = false;
  let firstPage = true;
  const subscribedAt = Date.now();
  const attributes = backgroundAttributes(context.env, "ai.generate", "subscribed");
  recordBackgroundCounter("ai_subscriber_open", attributes);
  const deadline = Date.now() + lifetimeMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  const stop = () => {
    if (!cancelled) recordBackgroundCounter("ai_subscriber_close", attributes);
    cancelled = true;
    context.request?.signal.removeEventListener("abort", stop);
    if (timer) clearTimeout(timer);
    wake?.();
  };
  context.request?.signal.addEventListener("abort", stop, { once: true });
  if (context.request?.signal.aborted) stop();
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (cancelled || Date.now() >= deadline) {
            stop();
            controller.close();
            return;
          }
          const page = await readChatRunPageInScope(
            context,
            receipt.runId,
            receipt.threadId,
            cursor,
          );
          if (cancelled) {
            controller.close();
            return;
          }
          if (firstPage) {
            firstPage = false;
            recordBackgroundHistogram("ai_replay_ms", Date.now() - subscribedAt, attributes);
          }
          if (page.reset) {
            recordBackgroundCounter("ai_snapshot_reset", attributes);
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "snapshot", snapshot: page.snapshot }) + "\n"),
            );
            cursor = page.snapshot.seq;
          } else if (page.events.length) {
            controller.enqueue(
              encoder.encode(page.events.map((event) => JSON.stringify(event)).join("\n") + "\n"),
            );
            cursor = page.events.at(-1)!.seq;
          } else controller.enqueue(encoder.encode("\n"));
          if (isRunTerminal(page.snapshot.status) && cursor >= page.snapshot.seq) {
            stop();
            controller.close();
            return;
          }
          if (!page.events.length)
            await new Promise<void>((resolve) => {
              wake = resolve;
              timer = setTimeout(resolve, 500);
            });
        } catch (error) {
          stop();
          controller.error(error);
        }
      },
      cancel: stop,
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    },
  );
}

/** Migration adapter for clients that still consume context/delta/done frames. */
export function legacyChatRunResponse(context: ServerOperationContext, receipt: ChatRunReceipt) {
  const source = chatRunResponse(context, receipt, receipt.seq, 180_000);
  const reader = source.body!.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = receipt.text;
  let terminal = false;
  const frame = (event: unknown) => encoder.encode(JSON.stringify(event) + "\n");
  const terminalFrame = (status: ChatRunReceipt["status"]) => {
    if (!isRunTerminal(status) || terminal) return null;
    terminal = true;
    return status === "completed" || status === "stopped"
      ? frame({ type: "done", status })
      : frame({ type: "error", message: `Answer ${status}. Reopen the conversation to retry.` });
  };
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          frame({ type: "context", threadId: receipt.threadId, context: receipt.context }),
        );
        if (text) controller.enqueue(frame({ type: "delta", text }));
        const done = terminalFrame(receipt.status);
        if (done) controller.enqueue(done);
      },
      async pull(controller) {
        try {
          if (terminal) {
            await reader.cancel();
            controller.close();
            return;
          }
          const next = await reader.read();
          buffer += decoder.decode(next.value, { stream: !next.done });
          let end;
          while ((end = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 1);
            if (!line.trim()) continue;
            const item = JSON.parse(line);
            if (item.type === "snapshot") {
              if (!item.snapshot.text.startsWith(text)) throw new Error("CHAT_RUN_TEXT_MISMATCH");
              const suffix = item.snapshot.text.slice(text.length);
              text = item.snapshot.text;
              if (suffix) controller.enqueue(frame({ type: "delta", text: suffix }));
              const done = terminalFrame(item.snapshot.status);
              if (done) controller.enqueue(done);
            } else if (item.event.type === "delta") {
              text += item.event.text;
              controller.enqueue(frame(item.event));
            } else if (item.event.type === "status" || item.event.type === "done") {
              const done = terminalFrame(item.event.status);
              if (done) controller.enqueue(done);
            } else if (item.event.type === "error") {
              terminal = true;
              controller.enqueue(frame(item.event));
            }
          }
          if (next.done || terminal) {
            await reader.cancel();
            controller.close();
          }
        } catch (error) {
          await reader.cancel().catch(() => {});
          controller.error(error);
        }
      },
      cancel: () => reader.cancel(),
    }),
    { headers: source.headers },
  );
}
