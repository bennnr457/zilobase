import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
const dir = await mkdtemp(join(tmpdir(), "zilobase-clipper-api-"));
after(() => rm(dir, { recursive: true, force: true }));
const outfile = join(dir, "api.mjs");
await build({
  entryPoints: [new URL("../lib/api.ts", import.meta.url).pathname],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent",
  plugins: [
    {
      name: "extension-platform",
      setup(builder) {
        builder.onResolve({ filter: /^wxt\/browser$/ }, () => ({
          path: "browser",
          namespace: "extension-mock",
        }));
        builder.onLoad({ filter: /.*/, namespace: "extension-mock" }, () => ({
          contents:
            "export const browser = {tabs:{create(){}},storage:{local:{get:async()=>({}),set:async()=>{}}}};",
        }));
      },
    },
  ],
});
const { createClipperApiFetcher } = await import(pathToFileURL(outfile).href);
const session = {
  instanceUrl: "https://api.example",
  workspaceId: "workspace",
  workspaceName: "Workspace",
  token: "old",
  refreshToken: "refresh",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("clipper retries exactly once after 401 using refreshed credentials and the same operation body", async () => {
  const calls = [];
  let refreshes = 0;
  const api = createClipperApiFetcher(session, {
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return calls.length === 1 ? json({}, 401) : json({ pageId: "page" });
    },
    refresh: async (current) => {
      assert.equal(current, session);
      refreshes++;
      return { ...current, token: "new" };
    },
  });
  const body = JSON.stringify({ workspaceId: "workspace", title: "Clip" });
  assert.deepEqual(await api("/clips", { method: "POST", body }), { pageId: "page" });
  assert.equal(refreshes, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.example/clips");
  assert.equal(calls[0].init.headers.Authorization, "Bearer old");
  assert.equal(calls[1].init.headers.Authorization, "Bearer new");
  assert.equal(calls[1].init.body, body);
  assert.equal(calls[1].init.headers["x-zilobase-workspace-id"], "workspace");
});
for (const status of [400, 403, 409, 500])
  test(`clipper does not retry HTTP ${status}`, async () => {
    let calls = 0,
      refreshes = 0;
    const api = createClipperApiFetcher(session, {
      fetch: async () => {
        calls++;
        return json({ error: "save failed" }, status);
      },
      refresh: async () => {
        refreshes++;
        return session;
      },
    });
    await assert.rejects(api("/clips", { method: "POST", body: "{}" }), /save failed/);
    assert.equal(calls, 1);
    assert.equal(refreshes, 0);
  });
test("a second unauthorized response ends recovery", async () => {
  let calls = 0,
    refreshes = 0;
  const api = createClipperApiFetcher(session, {
    fetch: async () => {
      calls++;
      return json({}, 401);
    },
    refresh: async () => {
      refreshes++;
      return { ...session, token: "new" };
    },
  });
  await assert.rejects(api("/clips", { method: "POST", body: "{}" }), /Save failed \(401\)/);
  assert.equal(calls, 2);
  assert.equal(refreshes, 1);
});
