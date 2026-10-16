import { build } from "esbuild";
import { parseHTML } from "linkedom";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function register({ assert, sourcePath, test }) {
  let loaded;
  const runtime = () => (loaded ??= loadStartupRuntime(sourcePath));

  test("startup installs synchronously and preserves request observation errors and capture selection", async () => {
    const fixture = await runtime();
    const {
      controls,
      configureApplicationSessions,
      configureApplicationRequests,
      configureApplicationMeetingCapture,
      switchDesktopServerSession,
      NetworkUnavailableError,
    } = fixture;
    const saved = Object.getOwnPropertyDescriptor(globalThis, "window");
    globalThis.window = new EventTarget();
    try {
      controls.reset();
      assert.equal(configureApplicationSessions(), undefined);
      assert.equal(controls.sessionSwitch, switchDesktopServerSession);
      assert.equal(configureApplicationRequests(), undefined);
      assert.deepEqual(controls.calls, ["install.session", "install.requests"]);
      const failure = new Error("Installation failed");
      controls.failures["install.requests"] = failure;
      assert.throws(configureApplicationRequests, (error) => error === failure);
      delete controls.failures["install.requests"];
      let events = 0;
      window.addEventListener("zilobase:authentication-required", () => events++);
      assert.equal(controls.policy.observe({ type: "response", status: 401 }), undefined);
      assert.equal(events, 1, "authentication notification is immediate");
      controls.policy.observe({ type: "response", status: 500 });
      assert.equal(events, 1);
      assert.throws(
        () => controls.policy.observe({ type: "network-error", error: failure }),
        (error) => error instanceof NetworkUnavailableError && error.message === failure.message,
      );
      controls.demo = { handled: true, value: "demo" };
      assert.equal(controls.policy.intercept("/pages", "GET"), controls.demo);
      controls.demo = { handled: false };
      assert.deepEqual(controls.policy.intercept("/pages", "GET"), { handled: false });
      controls.reset();
      assert.equal(configureApplicationMeetingCapture(), undefined);
      assert.deepEqual(controls.calls, [
        "capture.browser",
        "capture.browser-runtime",
        "install.capture",
      ]);
      controls.reset();
      controls.desktop = true;
      configureApplicationMeetingCapture();
      assert.deepEqual(controls.calls, ["capture.native-runtime", "install.capture"]);
    } finally {
      if (saved) Object.defineProperty(globalThis, "window", saved);
      else delete globalThis.window;
    }
  });

  test("desktop switch stops traffic immediately and preserves commit order and failure identity", async () => {
    const { controls, switchDesktopServerSession } = await runtime();
    const saved = Object.getOwnPropertyDescriptor(globalThis, "window");
    globalThis.window = { location: { replace: (path) => controls.step("replace:" + path) } };
    const request = {
      candidateId: "candidate",
      server: { apiOrigin: "https://new.test", instanceId: "new" },
      path: "/p/page",
    };
    try {
      controls.reset();
      const promise = switchDesktopServerSession(request);
      assert.deepEqual(controls.calls, ["shutdown", "queries.cancel"]);
      assert.equal(await promise, "/p/page");
      const steps = [
        "shutdown",
        "queries.cancel",
        "commit:candidate",
        "credentials.forget",
        "replace:/p/page",
      ];
      assert.deepEqual(controls.calls, steps);
      for (const [index, step] of steps.entries()) {
        controls.reset();
        const failure = new Error(step);
        controls.failures[step] = failure;
        await assert.rejects(switchDesktopServerSession(request), (error) => error === failure);
        assert.deepEqual(controls.calls, steps.slice(0, index + 1));
      }
      controls.reset();
      await switchDesktopServerSession({
        ...request,
        candidateId: undefined,
        workspaceId: "workspace",
      });
      assert.deepEqual(controls.profile, {
        apiOrigin: "https://new.test",
        instanceId: "new",
        path: "/p/page",
        workspaceId: "workspace",
      });
      assert.equal(controls.calls[2], "profile.switch");
    } finally {
      if (saved) Object.defineProperty(globalThis, "window", saved);
      else delete globalThis.window;
    }
  });

  test("desktop store cleanup preserves snapshot protection, parallel persistence and scoped deletion", async () => {
    const { controls, createDesktopServerReplacementDependencies } = await runtime();
    const saved = Object.getOwnPropertyDescriptor(globalThis, "window");
    globalThis.window = {
      localStorage: { removeItem: (key) => controls.step("remove:" + key) },
      sessionStorage: { clear: () => controls.step("session.clear") },
    };
    const dependencies = createDesktopServerReplacementDependencies({
      beforeLocalCleanup: async () => {},
      reload: () => {},
    });
    const prepare = () => {
      controls.reset();
      controls.session = { user: { id: "user" } };
      controls.server = { instanceId: "old" };
    };
    const steps = [
      "snapshot.clear:user",
      "queries.clear",
      "account.reset",
      "auth.reset",
      "account.persist.clear",
      "auth.persist.clear",
      "remove:zilobase-app",
      "remove:zilobase-auth-flow",
      "remove:zilobase-app:old",
      "remove:zilobase-auth-flow:old",
      "session.clear",
    ];
    try {
      prepare();
      await dependencies.clearStores();
      assert.deepEqual(controls.calls, steps);
      for (const [index, step] of steps.entries()) {
        prepare();
        const failure = new Error(step);
        controls.failures[step] = failure;
        await assert.rejects(dependencies.clearStores(), (error) => error === failure);
        assert.deepEqual(
          controls.calls,
          steps.slice(0, step === "account.persist.clear" ? index + 2 : index + 1),
        );
      }
      controls.reset();
      await dependencies.clearStores();
      assert.ok(
        !controls.calls.some((step) => step.startsWith("snapshot.") || step.endsWith(":old")),
      );
    } finally {
      if (saved) Object.defineProperty(globalThis, "window", saved);
      else delete globalThis.window;
    }
  });

  test("desktop revocation releases its timer on success, transport and response failures", async () => {
    const { controls, createDesktopServerReplacementDependencies } = await runtime();
    const saved = Object.getOwnPropertyDescriptor(globalThis, "window");
    globalThis.window = {
      setTimeout: (callback, delay) => {
        controls.step("timer.start");
        controls.timer = { callback, delay };
        return 1;
      },
      clearTimeout: (id) => {
        assert.equal(id, 1);
        controls.step("timer.clear");
      },
    };
    const dependencies = createDesktopServerReplacementDependencies({
      beforeLocalCleanup: async () => {},
      reload: () => {},
    });
    try {
      controls.reset();
      await dependencies.revokeOldSession({ apiOrigin: "https://old.test" });
      assert.deepEqual(controls.calls, []);
      for (const step of [undefined, "request.headers", "request.revoke", "response.consume"]) {
        controls.reset();
        controls.token = "token";
        const failure = new Error(step);
        if (step) controls.failures[step] = failure;
        const promise = dependencies.revokeOldSession({ apiOrigin: "https://old.test" });
        if (step) await assert.rejects(promise, (error) => error === failure);
        else await promise;
        assert.equal(controls.calls.at(-1), "timer.clear");
        assert.equal(controls.timer.delay, 3_000);
        if (!step) {
          assert.equal(controls.request.url, "https://old.test/api/auth/sign-out");
          assert.equal(controls.request.options.body, "{}");
          assert.equal(controls.request.options.credentials, "include");
          assert.equal(controls.request.options.method, "POST");
          controls.timer.callback();
          assert.equal(controls.request.options.signal.aborted, true);
        }
      }
    } finally {
      if (saved) Object.defineProperty(globalThis, "window", saved);
      else delete globalThis.window;
    }
  });

  test("replacement UI preserves verification, stale-candidate disposal, same-instance navigation and errors", async () => {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
    Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true });
    const fixture = await runtime();
    const { controls, DesktopServerReplacementController, createElement, createRoot, act } =
      fixture;
    let root;
    const prepared = (id, instanceId = "new") => ({ candidateId: id, server: { instanceId } });
    const request = { serverUrl: "https://new.test", expectedInstanceId: "new", path: "/p/page" };
    const send = (value = request) => act(async () => controls.listener(value));
    const resolve = (id, value) => act(async () => controls.pending[id].resolve(value));
    const reject = (id, error) => act(async () => controls.pending[id].reject(error));
    try {
      controls.reset();
      root = createRoot(document.getElementById("root"));
      await act(async () =>
        root.render(
          createElement(DesktopServerReplacementController, {
            openPath: (path) => controls.step("navigate:" + path),
          }),
        ),
      );
      await send();
      assert.equal(controls.dialog.open, true);
      assert.match(document.body.textContent, /Verify Zilobase server/);
      await resolve(0, prepared("first"));
      assert.deepEqual(controls.switchRequest, {
        candidateId: "first",
        path: "/p/page",
        server: { instanceId: "new" },
      });
      assert.match(document.body.textContent, /Changing server/);
      await send();
      assert.equal(controls.pending.length, 1, "busy replacement rejects another request");
      await act(async () => root.unmount());
      controls.reset();
      root = createRoot(document.getElementById("root"));
      await act(async () =>
        root.render(
          createElement(DesktopServerReplacementController, {
            openPath: (path) => controls.step("navigate:" + path),
          }),
        ),
      );
      await send();
      await send();
      await resolve(0, prepared("stale"));
      assert.ok(controls.calls.includes("discard:stale"));
      assert.equal(controls.switchRequest, undefined);
      controls.server = { instanceId: "new" };
      await resolve(1, prepared("same"));
      assert.ok(controls.calls.includes("discard:same"));
      assert.equal(controls.calls.at(-1), "navigate:/p/page");
      assert.equal(controls.dialog.open, false);
      await send();
      await resolve(2, prepared("wrong", "wrong"));
      assert.ok(controls.calls.includes("discard:wrong"));
      assert.match(document.body.textContent, /different Zilobase instance/);
      await send();
      await send();
      await reject(3, new Error("stale failure"));
      assert.match(document.body.textContent, /Verify Zilobase server/);
      await reject(4, new Error("verification failed"));
      assert.match(document.body.textContent, /verification failed/);
      await act(async () => controls.dialog.onOpenChange(false));
      assert.equal(controls.dialog.open, false);
      await send();
      controls.server = null;
      controls.failures["command.switch"] = new Error("switch failed");
      await resolve(5, prepared("failed-switch"));
      assert.match(document.body.textContent, /switch failed/);
      await act(async () => root.unmount());
      assert.equal(controls.listener, null);
    } finally {
      if (root) await act(async () => root.unmount());
      for (const key of Object.getOwnPropertyNames(globalThis))
        if (!saved[key]) delete globalThis[key];
      Object.defineProperties(globalThis, saved);
    }
  });

  test("replacement confirmation preserves reverification, two-frame teardown and fatal cleanup failures", async () => {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
    Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true });
    const { controls, DesktopServerReplacementController, createElement, createRoot, act } =
      await runtime();
    const context = {
      phase: "confirm",
      prepared: { candidateId: "previous", server: { instanceId: "new" } },
      request: { serverUrl: "https://new.test", expectedInstanceId: "new", path: "/p/page" },
    };
    let root;
    const mount = async () => {
      controls.reset();
      controls.initialReplacement = context;
      controls.server = { instanceId: "old" };
      controls.session = { user: { id: "user" } };
      controls.frames = [];
      window.requestAnimationFrame = (callback) => controls.frames.push(callback);
      Object.defineProperties(window, {
        localStorage: {
          configurable: true,
          value: { removeItem: (key) => controls.step("remove:" + key) },
        },
        sessionStorage: {
          configurable: true,
          value: { clear: () => controls.step("session.clear") },
        },
      });
      window.location = { assign: (path) => controls.step("reload:" + path) };
      root = createRoot(document.getElementById("root"));
      await act(async () =>
        root.render(
          createElement(DesktopServerReplacementController, {
            openPath: (path) => controls.step("navigate:" + path),
          }),
        ),
      );
    };
    const click = () =>
      act(async () =>
        [...document.querySelectorAll("button")]
          .find((button) => button.textContent === "Change server")
          .dispatchEvent(new window.Event("click", { bubbles: true })),
      );
    const resolve = (value) => act(async () => controls.pending[0].resolve(value));
    const teardown = async () => {
      assert.equal(controls.frames.length, 1);
      assert.ok(!controls.calls.includes("queries.cancel"));
      await act(async () => controls.frames.shift()());
      assert.ok(!controls.calls.includes("queries.cancel"), "first frame does not release cleanup");
      await act(async () => controls.frames.shift()());
    };
    try {
      await mount();
      controls.failures["browser-auth.cancel"] = new Error(
        "Optional browser auth cancellation failed",
      );
      controls.failures["discard:previous"] = new Error("Optional stale candidate discard failed");
      await click();
      assert.match(document.body.textContent, /Reverify before changing/);
      await resolve({ candidateId: "refreshed", server: { instanceId: "new" } });
      assert.ok(controls.calls.includes("navigate:/login"));
      await teardown();
      const order = controls.calls;
      assert.ok(order.indexOf("shutdown") < order.indexOf("navigate:/login"));
      assert.ok(order.indexOf("queries.cancel") < order.indexOf("indexed.clear"));
      assert.ok(order.indexOf("session.clear") < order.indexOf("commit:refreshed"));
      assert.deepEqual(order.slice(-4), [
        "commit:refreshed",
        "credentials.forget",
        "reload:/p/page",
        "server_replacement.commit:success",
      ]);
      await act(async () => root.unmount());

      await mount();
      await click();
      await resolve({ candidateId: "wrong", server: { instanceId: "wrong" } });
      assert.ok(controls.calls.includes("discard:wrong"));
      assert.ok(!controls.calls.includes("shutdown"));
      assert.match(document.body.textContent, /different Zilobase instance/);
      await act(async () => root.unmount());

      await mount();
      controls.failures["indexed.clear"] = new Error("Local deletion failed");
      await click();
      await resolve({ candidateId: "refreshed", server: { instanceId: "new" } });
      await teardown();
      assert.match(document.body.textContent, /Local deletion failed.*Restart Zilobase/);
      assert.ok(!controls.calls.includes("commit:refreshed"));
      await act(async () => root.unmount());

      await mount();
      controls.server = null;
      await click();
      assert.match(document.body.textContent, /current desktop server is unavailable/);
      assert.equal(controls.pending.length, 0);
    } finally {
      if (root) await act(async () => root.unmount());
      for (const key of Object.getOwnPropertyNames(globalThis))
        if (!saved[key]) delete globalThis[key];
      Object.defineProperties(globalThis, saved);
    }
  });
}

async function loadStartupRuntime(sourcePath) {
  const require = createRequire(import.meta.url);
  const mocks = {
    react: `import React from ${JSON.stringify(require.resolve("react"))}; import { controls } from "startup-test-ports"; export const { createElement, act, useRef, useEffect, useCallback } = React; export const useState = initial => React.useState(initial?.phase === "idle" && controls.initialReplacement ? controls.initialReplacement : initial);`,
    "startup-test-ports": `
      export const controls = {
        reset() { this.calls = []; this.failures = {}; this.desktop = false; this.demo = { handled: false }; this.session = null; this.server = null; this.token = null; this.pending = []; this.switchRequest = undefined; this.initialReplacement = undefined; },
        step(name) { this.calls.push(name); if (this.failures[name]) throw this.failures[name]; }
      }; controls.reset();
      export const shutdown = () => controls.step("shutdown");
      export async function cancelQueries() { controls.step("queries.cancel"); }
      export const forget = () => controls.step("credentials.forget");
      export async function commit(id) { controls.step("commit:" + id); return { changed: true, server: controls.server }; }
      export async function switchProfile(input) { controls.profile = input; controls.step("profile.switch"); }
      export async function prepare() { return new Promise((resolve, reject) => controls.pending.push({ resolve, reject })); }
      export async function discard(id) { controls.step("discard:" + id); }
    `,
    "@/platform/network/api": `import { controls } from "startup-test-ports"; export class NetworkUnavailableError extends Error {} export const getApiErrorMessage = error => error.message; export function getApiRequestHeaders(headers) { controls.step("request.headers"); return headers; }`,
    "@/platform/network/request-policy": `import { controls } from "startup-test-ports"; export function installRequestPolicy(policy) { controls.step("install.requests"); controls.policy = policy; }`,
    "@/app/demo/transport": `import { controls } from "startup-test-ports"; export const interceptDemoRequest = () => controls.demo; export const applyDemoReadOverlay = (_path, value) => value;`,
    "@/platform/server/operations/desktop-server-switch": `import { controls } from "startup-test-ports"; export function installDesktopServerSwitch(value) { controls.step("install.session"); controls.sessionSwitch = value; } export async function executeDesktopServerSwitch(request) { controls.switchRequest = request; controls.step("command.switch"); }`,
    "@/platform/desktop/native": `import { controls } from "startup-test-ports"; export const isDesktopApp = () => controls.desktop;`,
    "@/platform/desktop/meetings/native-capture-runtime": `import { controls } from "startup-test-ports"; export function createNativeMeetingCaptureRuntime() { controls.step("capture.native-runtime"); return {}; }`,
    "@/platform/browser/meetings/browser-meeting-capture": `import { controls } from "startup-test-ports"; export class BrowserMeetingCapture { constructor() { controls.step("capture.browser"); } }`,
    "@/platform/browser/meetings/browser-capture-runtime": `import { controls } from "startup-test-ports"; export function createBrowserMeetingCaptureRuntime() { controls.step("capture.browser-runtime"); return {}; }`,
    "@/platform/meetings/capture-runtime": `import { controls } from "startup-test-ports"; export function installMeetingCaptureRuntime(value) { controls.step("install.capture"); controls.capture = value; }`,
    "@/platform/auth/desktop-auth-token": `export { forget as forgetDesktopAuthCredentials } from "startup-test-ports"; import { controls } from "startup-test-ports"; export const getDesktopAuthToken = () => controls.token;`,
    "@/platform/network/desktop-network": `export { shutdown as beginDesktopServerNetworkShutdown } from "startup-test-ports"; import { controls } from "startup-test-ports"; export async function desktopNetworkFetch(url, options) { controls.request = { url, options }; controls.step("request.revoke"); return { async arrayBuffer() { controls.step("response.consume"); } }; }`,
    "@/platform/storage/indexed-data-cleanup": `import { controls } from "startup-test-ports"; export async function clearIndexedDataForServer() { controls.step("indexed.clear"); }`,
    "@/app/query-client": `import { controls, cancelQueries } from "startup-test-ports"; export const queryClient = { cancelQueries, getQueryData: () => controls.session, clear: () => controls.step("queries.clear") };`,
    "@/platform/server/desktop-server": `export { commit as commitDesktopServerCandidate, switchProfile as switchDesktopServerProfile, prepare as prepareDesktopServerCandidate, discard as discardDesktopServerCandidate } from "startup-test-ports"; import { controls } from "startup-test-ports"; export const getSelectedDesktopServer = () => controls.server; export const resolveDesktopServerSwitchPath = request => request.path ?? "/login"; export const desktopServersReferToSameInstance = (a,b) => a.instanceId === b.instanceId;`,
    "@/app/state/app-store": `import { controls } from "startup-test-ports"; export const useAppStore = { getState: () => ({ resetAccountState: () => controls.step("account.reset") }), persist: { async clearStorage() { controls.step("account.persist.clear"); } } };`,
    "@/sections/auth/hooks/auth-flow-store": `import { controls } from "startup-test-ports"; export const useAuthFlowStore = { getState: () => ({ clearAuthFlow: () => controls.step("auth.reset") }), persist: { async clearStorage() { controls.step("auth.persist.clear"); } } };`,
    "@/platform/storage/client-cache-storage": `import { controls } from "startup-test-ports"; export async function clearPageSnapshotsForDeployment(id) { controls.step("snapshot.clear:" + id); }`,
    "@zilobase/features/auth": `export const sessionQueryKey = ["session"];`,
    "@/platform/diagnostics/desktop-diagnostics": `import { controls } from "startup-test-ports"; export const describeDesktopError = error => ({ message: error.message }); export const recordDesktopDiagnostic = (name, data) => controls.step(name + ":" + (data.status ?? data.message));`,
    "@/platform/server/operations/desktop-server-replacement": `import { controls } from "startup-test-ports"; export function subscribeDesktopServerReplacement(callback) { controls.listener = callback; return () => { controls.listener = null; }; }`,
    "@/platform/auth/browser-authorization": `import { controls } from "startup-test-ports"; export async function cancelDesktopBrowserSignIn() { controls.step("browser-auth.cancel"); }`,
    "@/components/ui/spinner": `export const Spinner = () => null;`,
    "@/components/ui/alert-dialog": `import { createElement } from "react"; import { controls } from "startup-test-ports"; export function AlertDialog(props) { controls.dialog = props; return createElement("div", { hidden: !props.open }, props.children); } const Part = ({children}) => createElement("div", null, children); const Button = ({children,onClick}) => createElement("button", {onClick}, children); export { Part as AlertDialogContent, Part as AlertDialogDescription, Part as AlertDialogFooter, Part as AlertDialogHeader, Part as AlertDialogTitle, Button as AlertDialogAction, Button as AlertDialogCancel };`,
  };
  const result = await build({
    stdin: {
      contents: `export * from "./startup"; export * from "./desktop-session"; export { DesktopServerReplacementController } from "../sections/desktop/servers/components/desktop-server-replacement-controller"; export { controls } from "startup-test-ports"; export { NetworkUnavailableError } from "@/platform/network/api"; export { createElement, act } from "react"; export { createRoot } from "react-dom/client";`,
      resolveDir: sourcePath("/src/app"),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    logLevel: "silent",
    plugins: [
      {
        name: "startup-platform-ports",
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) => {
            if (path === "react") return { path, namespace: "startup-mock" };
            if (path === require.resolve("react")) return { path, external: true };
            // Load React through Node so async act uses its native task scheduler.
            if (/^react(?:-dom)?(?:\/|$)/.test(path))
              return { path: require.resolve(path), external: true };
            const normalized = path.replace(/^(?:\.\.\/)+platform\//, "@/platform/");
            if (normalized in mocks) return { path: normalized, namespace: "startup-mock" };
            if (path === "@/app/desktop-session")
              return { path: sourcePath("/src/app/desktop-session.ts") };
          });
          builder.onLoad({ filter: /./, namespace: "startup-mock" }, ({ path }) => ({
            contents: mocks[path],
            resolveDir: sourcePath("/src/app"),
            loader: "ts",
          }));
        },
      },
    ],
  });
  const directory = await mkdtemp(join(tmpdir(), "zilobase-startup-"));
  try {
    const path = join(directory, "runtime.mjs");
    await writeFile(path, result.outputFiles[0].text);
    return await import(pathToFileURL(path).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
