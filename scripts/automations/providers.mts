import assert from "node:assert/strict";
export function createProviders() {
  const requests: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
  const attempts = new Map<string, number>();
  const barriers = new Map<
    string,
    { entered: () => void; release: Promise<void>; unblock: () => void }
  >();
  return {
    requests,
    attempts,
    releaseAll() {
      for (const barrier of barriers.values()) barrier.unblock();
    },
    barrier(path: string) {
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      barriers.set(path, {
        entered: entered.resolve,
        release: release.promise,
        unblock: release.resolve,
      });
      return { entered: entered.promise, release: () => release.resolve() };
    },
    async fetch(request: Request) {
      const url = new URL(request.url);
      if (url.hostname === "dns.google" || url.hostname === "cloudflare-dns.com")
        return Response.json({ Answer: [{ type: 1, data: "93.184.216.34" }] });
      if (url.hostname === "slack.com" && url.pathname.endsWith("conversations.list"))
        return Response.json({
          ok: true,
          channels: [{ id: "C_FIXTURE", name: "fixture", is_member: true }],
        });
      assert.ok(
        url.hostname === "slack.com" || url.hostname.endsWith(".automation.test"),
        `Unexpected external host: ${url.hostname}`,
      );
      const text = await request.text();
      const body = text ? JSON.parse(text) : {};
      requests.push({ url: request.url, headers: Object.fromEntries(request.headers), body });
      const key = url.pathname;
      const attempt = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, attempt);
      const barrier = barriers.get(key);
      if (barrier) {
        barrier.entered();
        await barrier.release;
      }
      if (key.includes("terminal")) return new Response("Rejected", { status: 400 });
      if (key.includes("retry") && attempt === 1)
        return new Response("Retry", { status: 429, headers: { "retry-after": "1" } });
      if (url.hostname === "slack.com")
        return Response.json({ ok: true, channel: body.channel, ts: `fixture.${attempt}` });
      return new Response("Accepted", { status: 200 });
    },
  };
}
