import { expect, test, vi } from "vitest";
// @ts-expect-error The gateway is a JavaScript-only public entrypoint.
import { createWebGateway } from "./gateway.js";

test("Ask AI admission and streaming use the API service instead of SPA assets", async () => {
  const gateway = createWebGateway({ apiOrigin: "https://api.example.com" });
  const body = JSON.stringify({ requestId: "request", text: "Read my source" });
  const assets = { fetch: vi.fn(async () => new Response("<html>app</html>")) };
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      controller.enqueue(new TextEncoder().encode('data: {"type":"delta"}\n\n'));
    },
  });
  const api = {
    fetch: vi.fn(async (request: Request) =>
      request.method === "POST"
        ? Response.json({ runId: "run" }, { status: 202 })
        : new Response(stream, { headers: { "Content-Type": "text/event-stream" } }),
    ),
  };
  const admitted = await gateway.fetch(
    new Request("https://app.example.com/ai/turns", {
      method: "POST",
      headers: { Cookie: "session=valid", "Content-Type": "application/json" },
      body,
    }),
    { API_SERVICE: api, ASSETS: assets },
  );
  expect(admitted.status).toBe(202);
  const forwarded = api.fetch.mock.calls[0]![0];
  expect(forwarded.url).toBe("https://api.example.com/ai/turns");
  expect(forwarded.headers.get("cookie")).toBe("session=valid");
  expect(await forwarded.text()).toBe(body);

  const events = await gateway.fetch(
    new Request("https://app.example.com/ai/runs/run/events?after=2"),
    { API_SERVICE: api, ASSETS: assets },
  );
  expect(api.fetch.mock.calls[1]![0].url).toBe(
    "https://api.example.com/ai/runs/run/events?after=2",
  );
  expect(events.headers.get("content-type")).toBe("text/event-stream");
  const reader = events.body!.getReader();
  const chunk = await reader.read();
  expect(new TextDecoder().decode(chunk.value)).toContain('"type":"delta"');
  streamController.close();
  expect((await reader.read()).done).toBe(true);
  expect(assets.fetch).not.toHaveBeenCalled();
});

test("hosted demo cannot admit Ask AI runs", async () => {
  const gateway = createWebGateway({
    apiOrigin: "https://api.example.com",
    demo: { host: "demo.example.com" },
  });
  const api = { fetch: vi.fn() };
  const response = await gateway.fetch(
    new Request("https://demo.example.com/ai/turns", { method: "POST", body: "{}" }),
    { API_SERVICE: api },
  );
  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ code: "DEMO_READ_ONLY" });
  expect(api.fetch).not.toHaveBeenCalled();
});
