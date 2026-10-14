import { build } from "esbuild";
import { parseHTML } from "linkedom";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function register({ assert, sourcePath, test }) {
  let loaded;
  const runtime = () => (loaded ??= loadProviderRuntime(sourcePath));

  test("web session provider preserves persistence, offline recovery, errors and transport options", async () => {
    const { webAuthClient, controls } = await runtime();
    const session = { user: { id: "user" }, session: { id: "session" } };
    controls.reset();
    controls.responses["/session"] = session;
    const signal = new AbortController().signal;
    assert.equal(await webAuthClient.getSession(signal), session);
    assert.equal(controls.cached, session);
    assert.equal(controls.requestOptions.signal, signal);
    assert.equal(controls.requestOptions.timeoutMs, 15_000);
    assert.deepEqual(
      controls.diagnostics.map((item) => item.data.status),
      ["started", "success"],
    );
    controls.failures["session.write:deployment"] = new Error("Storage unavailable");
    assert.equal(await webAuthClient.getSession(), session);

    controls.reset();
    const failure = new Error("Network unavailable");
    controls.failures["request:/session"] = failure;
    controls.cached = session;
    await assert.rejects(webAuthClient.getSession(), (error) => error === failure);
    assert.ok(
      !controls.calls.includes("session.read"),
      "online failures do not restore an offline session",
    );
    controls.offline = true;
    assert.equal(await webAuthClient.getSession(), session);
    controls.failures["session.read"] = new Error("Cache unavailable");
    await assert.rejects(webAuthClient.getSession(), (error) => error === failure);
    controls.reset();
    controls.responses["/session"] = session;
    controls.offline = true;
    controls.cached = session;
    controls.failures["diagnostic:success"] = failure;
    assert.equal(
      await webAuthClient.getSession(),
      session,
      "synchronous adapter failures retain offline recovery",
    );
    controls.reset();
    const controller = new AbortController();
    const aborted = new DOMException("Cancelled", "AbortError");
    controller.abort(aborted);
    await assert.rejects(webAuthClient.getSession(controller.signal), (error) => error === aborted);
    controls.reset();
  });

  test("web sign-out preserves ordered cleanup and stops at the original failing step", async () => {
    const { webAuthClient, controls } = await runtime();
    const steps = [
      "session.read",
      "request:/api/auth/sign-out",
      "session.clear",
      "page.clear:user",
      "posthog.reset",
      "token.clear",
      "account.reset",
    ];
    const prepare = () => {
      controls.reset();
      controls.cached = { user: { id: "user" }, session: { id: "session" } };
      controls.responses["/api/auth/sign-out"] = { success: true };
    };
    prepare();
    assert.deepEqual(await webAuthClient.signOut(), { success: true });
    assert.deepEqual(controls.calls, steps);
    assert.equal(controls.cached, null);
    for (const [index, step] of steps.entries()) {
      prepare();
      const failure = new Error(step);
      controls.failures[step] = failure;
      await assert.rejects(webAuthClient.signOut(), (error) => error === failure);
      assert.deepEqual(controls.calls, steps.slice(0, index + 1));
    }
    controls.reset();
    await webAuthClient.signOut();
    assert.ok(!controls.calls.some((step) => step.startsWith("page.clear:")));
    controls.reset();
  });

  test("web demo provider rejects writes and preserves workspace reads", async () => {
    const { webAuthClient, controls } = await runtime();
    controls.reset();
    controls.demo = true;
    await assert.rejects(webAuthClient.signOut(), (error) => error === controls.demoError);
    await assert.rejects(
      webAuthClient.signInWithPassword({ email: "test@example.test", password: "test" }),
      (error) => error === controls.demoError,
    );
    assert.deepEqual(controls.calls, ["demo.guard", "demo.guard"]);
    const workspace = { id: "workspace", name: "Workspace", slug: "workspace" };
    controls.responses["/demo/bootstrap"] = { workspace };
    assert.deepEqual(await webAuthClient.listWorkspaces(), [workspace]);
    assert.deepEqual(await webAuthClient.listWorkspaceInvitations("workspace"), []);
    controls.reset();
  });

  test("theme provider preserves document updates when local storage fails", async () => {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
    Object.assign(globalThis, { window, document });
    let root;
    try {
      const { ThemeFamilyProvider, useThemeFamily, createElement, createRoot, flushSync } =
        await runtime();
      const storageError = new Error("Storage unavailable");
      const values = new Map();
      let stored = "warm";
      let fail = false;
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: {
          getItem: () => {
            if (fail) throw storageError;
            return stored;
          },
          setItem: (key, value) => {
            if (fail) throw storageError;
            values.set(key, value);
          },
        },
      });
      let context;
      function Probe() {
        context = useThemeFamily();
        return null;
      }
      const mount = () => {
        root = createRoot(document.getElementById("root"));
        flushSync(() =>
          root.render(createElement(ThemeFamilyProvider, null, createElement(Probe))),
        );
      };
      mount();
      assert.equal(context.themeFamily, "warm");
      assert.equal(document.documentElement.dataset.themeFamily, "warm");
      fail = true;
      flushSync(() => context.setThemeFamily("forest"));
      assert.equal(context.themeFamily, "forest");
      assert.equal(document.documentElement.dataset.themeFamily, "forest");
      flushSync(() => root.unmount());
      mount();
      assert.equal(context.themeFamily, "default");
      flushSync(() => root.unmount());
      fail = false;
      stored = "rose";
      mount();
      assert.equal(context.themeFamily, "default");
      assert.ok([...values.values()].includes("default"));
    } finally {
      if (root) (await runtime()).flushSync(() => root.unmount());
      await new Promise((resolve) => setTimeout(resolve, 10));
      for (const key of Object.getOwnPropertyNames(globalThis))
        if (!saved[key]) delete globalThis[key];
      Object.defineProperties(globalThis, saved);
    }
  });
}

async function loadProviderRuntime(sourcePath) {
  const ports = `
    export const controls = {
      reset() { this.calls = []; this.failures = {}; this.responses = {}; this.diagnostics = []; this.cached = null; this.offline = false; this.demo = false; this.demoError = new Error("Demo read-only"); },
      step(name) { this.calls.push(name); if (this.failures[name]) throw this.failures[name]; }
    };
    controls.reset();
    export async function apiFetch(path, options = {}) { controls.step("request:" + path); controls.requestOptions = options; if (options.signal?.aborted) throw options.signal.reason; return controls.responses[path] ?? null; }
    export const webClientCacheStorage = { session: {
      async write(deployment, session) { controls.step("session.write:" + deployment); controls.cached = session; },
      async clear() { controls.step("session.clear"); controls.cached = null; }
    } };
    export async function readCachedSession(...args) { if (args.length) throw new Error("Unexpected session storage arguments"); controls.step("session.read"); return controls.cached; }
    export async function clearCachedSession(...args) { if (args.length) throw new Error("Unexpected session storage arguments"); controls.step("session.clear"); controls.cached = null; }
  `;
  const mocks = {
    "provider-test-ports": ports,
    "@/platform/network/api": `export { apiFetch } from "provider-test-ports"; import { controls } from "provider-test-ports"; export async function clearApiAuthToken() { controls.step("token.clear"); }`,
    "@/platform/storage/client-cache-storage": `export { webClientCacheStorage, readCachedSession, clearCachedSession } from "provider-test-ports";`,
    "@/platform/network/connectivity": `import { controls } from "provider-test-ports"; export const webClientLifecycle = {}; export const getConnectivityState = () => controls.offline ? "offline" : "online";`,
    "@/platform/diagnostics/index": `import { controls } from "provider-test-ports"; export const describeDesktopError = error => ({ message: error.message }); export function recordDesktopDiagnostic(name, data, level) { controls.diagnostics.push({ name, data, level }); if (controls.failures["diagnostic:" + data.status]) throw controls.failures["diagnostic:" + data.status]; }`,
    "@/app/query-client": `export const queryClient = {}; export const clientDeployment = () => "deployment";`,
    "@/app/state/app-store": `import { controls } from "provider-test-ports"; export function useAppStore(select) { return select({}); } useAppStore.getState = () => ({ resetAccountState() { controls.step("account.reset"); } });`,
    "@/app/demo": `import { controls } from "provider-test-ports"; export const isHostedDemoRuntime = () => controls.demo; export function requestDemoGuard() { controls.step("demo.guard"); return controls.demoError; }`,
    "@/lib/posthog": `import { controls } from "provider-test-ports"; export default { reset() { controls.step("posthog.reset"); } };`,
    "@/components/editor/collaboration/page-document-cache": `import { controls } from "provider-test-ports"; export async function clearPageCacheForUser(id) { controls.step("page.clear:" + id); }`,
  };
  const result = await build({
    stdin: {
      contents: `export { webAuthClient } from "./features-provider"; export { ThemeFamilyProvider, useThemeFamily } from "./theme-family-provider"; export { createElement } from "react"; export { createRoot } from "react-dom/client"; export { flushSync } from "react-dom"; export { controls } from "provider-test-ports";`,
      resolveDir: sourcePath("/src/app/providers"),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    logLevel: "silent",
    plugins: [
      {
        name: "provider-platform-ports",
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) => {
            if (path in mocks) return { path, namespace: "provider-mock" };
            if (path.startsWith("@/")) {
              const target = sourcePath(`/src/${path.slice(2)}`);
              return { path: existsSync(target + ".ts") ? target + ".ts" : target + ".tsx" };
            }
          });
          builder.onLoad({ filter: /./, namespace: "provider-mock" }, ({ path }) => ({
            contents: mocks[path],
            resolveDir: sourcePath("/src/app/providers"),
            loader: "ts",
          }));
        },
      },
    ],
  });
  const tempDir = await mkdtemp(join(tmpdir(), "zilobase-provider-"));
  try {
    const file = join(tempDir, "runtime.mjs");
    await writeFile(file, result.outputFiles[0].text);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
