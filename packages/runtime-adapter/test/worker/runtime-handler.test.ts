import { describe, expect, it, vi } from "vitest";

import { createWorkerHandler } from "../../src/worker/handler";

describe("Cloudflare worker handler", () => {
  it("loads the app once and adds request timing metadata", async () => {
    const fetch = vi.fn(async () => new Response("app", { status: 201 }));
    const loadApp = vi.fn(async () => ({ fetch }));
    const handler = createWorkerHandler({ loadApp });
    const firstEnv = { binding: "first" };

    const first = await handler.fetch(
      new Request("https://api.example.com/pages", {
        headers: {
          "cf-ray": "ray-1",
          "x-zilobase-request-id": "request-1",
        },
      }),
      firstEnv,
      {},
    );
    const second = await handler.fetch(new Request("https://api.example.com/pages"), {}, {});

    expect(await first.text()).toBe("app");
    expect(first.status).toBe(201);
    expect(first.headers.get("x-zilobase-request-id")).toBe("request-1");
    expect(first.headers.get("x-zilobase-worker-path")).toBe("/pages");
    expect(first.headers.get("server-timing")).toMatch(
      /zilobase_app_load;dur=\d+, zilobase_app_fetch;dur=\d+, zilobase_total;dur=\d+/,
    );
    expect(second.headers.get("x-zilobase-request-id")).toBeTruthy();
    expect(loadApp).toHaveBeenCalledOnce();
    expect(loadApp).toHaveBeenCalledWith(firstEnv);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("forwards /agents requests to the application", async () => {
    const appFetch = vi.fn(async () => new Response("app"));
    const handler = createWorkerHandler({
      loadApp: async () => ({ fetch: appFetch }),
    });

    const response = await handler.fetch(
      new Request("https://api.example.com/agents/chat/thread-1"),
      {},
      {},
    );

    expect(await response.text()).toBe("app");
    expect(appFetch).toHaveBeenCalledOnce();
    expect(response.headers.get("server-timing")).toMatch(
      /zilobase_app_load;dur=\d+, zilobase_app_fetch;dur=\d+, zilobase_total;dur=\d+/,
    );
  });

  it("rethrows request failures", async () => {
    const error = new Error("app failed");
    const handler = createWorkerHandler({
      loadApp: async () => ({
        fetch: async () => {
          throw error;
        },
      }),
    });

    await expect(
      handler.fetch(new Request("https://api.example.com/failure"), {}, {}),
    ).rejects.toBe(error);
  });
});
