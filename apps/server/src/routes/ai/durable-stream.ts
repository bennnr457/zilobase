import type { ChatRunReceipt } from "@zilobase/features/runtime";
import type { ServerOperationContext } from "../../services/operations/context";
import { readChatRunPageInScope, isRunTerminal } from "../../services/ai/runs";

/** Subscriber lifetime only. The producer is owned by a background dispatch. */
export function chatRunResponse(
  context: ServerOperationContext,
  receipt: ChatRunReceipt,
  after: number,
) {
  const encoder = new TextEncoder();
  let cursor = after;
  let cancelled = false;
  const deadline = Date.now() + 20_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  const stop = () => {
    cancelled = true;
    context.request?.signal.removeEventListener("abort", stop);
    if (timer) clearTimeout(timer);
    wake?.();
  };
  context.request?.signal.addEventListener("abort", stop, { once: true });
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
          if (page.reset) {
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
