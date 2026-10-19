import { listChatThreads, getChatThread, deleteChatThread } from "../../services/ai/conversations";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { chatRequestSchema } from "@zilobase/features/runtime";
import type { AppBindings } from "../../shared/contracts/http";
import { prepareChat } from "../../services/ai/chat";
import { jsonValidator } from "../http/json";
import { serverOperationContext } from "../http/operation-context";
import { attachServiceErrorHandler } from "../http/route-error";

export const aiRoutes = attachServiceErrorHandler(new Hono<AppBindings>());
aiRoutes.use(
  "*",
  bodyLimit({
    maxSize: 2_000_000,
    onError: (c) => c.json({ error: "Chat request exceeds 2 MB" }, 413),
  }),
);
aiRoutes.post("/chat", jsonValidator(chatRequestSchema), async (c) => {
  const prepared = await prepareChat(serverOperationContext(c), c.req.valid("json"));
  const cancellation = new AbortController();
  const signal = AbortSignal.any([
    c.req.raw.signal,
    cancellation.signal,
    AbortSignal.timeout(180_000),
  ]);
  const iterator = prepared.events(signal);
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (next.done) controller.close();
          else controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
        } catch (error) {
          cancellation.abort();
          controller.error(error);
        }
      },
      async cancel() {
        cancellation.abort();
        await iterator.return(undefined);
        await prepared.cancel();
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    },
  );
});

aiRoutes.get("/threads", async (c) =>
  c.json(await listChatThreads(serverOperationContext(c), c.req.query("workspaceId") ?? "")),
);
aiRoutes.get("/threads/:id", async (c) =>
  c.json(
    await getChatThread(
      serverOperationContext(c),
      c.req.query("workspaceId") ?? "",
      c.req.param("id"),
    ),
  ),
);
aiRoutes.delete("/threads/:id", async (c) =>
  c.json(
    await deleteChatThread(
      serverOperationContext(c),
      c.req.query("workspaceId") ?? "",
      c.req.param("id"),
    ),
  ),
);
