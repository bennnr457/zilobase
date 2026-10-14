import { build } from "esbuild";
import { parseHTML } from "linkedom";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function register({ assert, loadModule, sourcePath, test }) {
  test("route errors keep desktop reconnect copy off the web", async () => {
    const { describeRouteError } = await loadModule("/src/app/routing/route-error-page.tsx");
    const networkError = Object.assign(new Error("Zilobase is offline."), {
      name: "NetworkUnavailableError",
    });

    assert.deepEqual(
      describeRouteError(new Error("boom"), {
        isDesktop: false,
        selectedServer: null,
      }),
      {
        description: "Please try again.",
        showChangeServer: false,
        title: "Something went wrong",
      },
    );

    assert.deepEqual(
      describeRouteError(networkError, {
        isDesktop: false,
        selectedServer: null,
      }),
      {
        description: "Check your connection and try again.",
        showChangeServer: false,
        title: "Couldn't connect to Zilobase",
      },
    );

    assert.deepEqual(
      describeRouteError(networkError, {
        isDesktop: true,
        selectedServer: null,
      }),
      {
        description: "Your desktop session is still saved. Check your connection and try again.",
        showChangeServer: false,
        title: "Couldn't connect to Zilobase",
      },
    );

    assert.deepEqual(
      describeRouteError(new Error("boom"), {
        isDesktop: true,
        selectedServer: { apiOrigin: "https://api.zilobase.com" },
      }),
      {
        description:
          "Your desktop session is still saved. Check your connection, or connect to a different server.",
        showChangeServer: true,
        title: "Couldn't connect to Zilobase",
      },
    );
  });

  test("route error profile Effects recover failed reads and stop after cleanup", async () => {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
    Object.assign(globalThis, { window, document });
    let fixture;
    let root;
    const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
    try {
      fixture = await loadErrorSurface(sourcePath);
      const { RouteErrorPage, createElement, createRoot, flushSync, controls } = fixture;
      const profiles = [
        {
          active: true,
          server: {
            instanceId: "active",
            apiOrigin: "https://active.test",
            displayName: "Current",
          },
        },
        {
          active: false,
          server: { instanceId: "other", apiOrigin: "https://other.test", displayName: "Other" },
          hasCredentials: true,
          lastPath: "/p/page",
          lastActiveWorkspaceId: "workspace",
        },
      ];
      const render = () =>
        flushSync(() =>
          root.render(createElement(RouteErrorPage, { error: new Error("Offline") })),
        );
      const mount = () => {
        root = createRoot(document.getElementById("root"));
        render();
      };
      controls.profiles = Promise.resolve({ profiles });
      mount();
      await settle();
      assert.match(document.body.textContent, /Switch to Other/);
      assert.doesNotMatch(document.body.textContent, /Switch to Current/);
      const button = (text) =>
        [...document.querySelectorAll("button")].find((item) => item.textContent === text);
      button("Switch to Other").click();
      button("Change server").click();
      assert.equal(controls.switched.server, profiles[1].server);
      assert.equal(controls.switched.path, "/p/page");
      assert.deepEqual(controls.navigation, { to: "/connect" });
      flushSync(() => root.unmount());
      controls.profiles = Promise.reject(new Error("Storage unavailable"));
      mount();
      await settle();
      assert.doesNotMatch(document.body.textContent, /Switch to Other/);
      assert.match(document.body.textContent, /Try again/);
      flushSync(() => root.unmount());
      controls.profiles = Promise.resolve({ profiles: null });
      mount();
      await settle();
      assert.doesNotMatch(document.body.textContent, /Switch to/);
      flushSync(() => root.unmount());
      let resolveProfiles;
      controls.profiles = new Promise((resolve) => {
        resolveProfiles = resolve;
      });
      mount();
      controls.selected = null;
      render();
      resolveProfiles({ profiles });
      await settle();
      assert.doesNotMatch(document.body.textContent, /Switch to Other|Change server/);
      assert.equal(controls.reads, 4);
    } finally {
      if (root) fixture.flushSync(() => root.unmount());
      await settle();
      for (const key of Object.getOwnPropertyNames(globalThis))
        if (!saved[key]) delete globalThis[key];
      Object.defineProperties(globalThis, saved);
    }
  });
}

async function loadErrorSurface(sourcePath) {
  const mocks = {
    "error-test-ports": `export const controls = { selected: { instanceId: "active" }, reads: 0 };`,
    "@tanstack/react-router": `import { controls } from "error-test-ports"; export const useNavigate = () => options => { controls.navigation = options; };`,
    "@/components/desktop/index": `export const isDesktopApp = () => true;`,
    "@/platform/diagnostics/index": `export const describeDesktopError = () => ({}); export const recordDesktopDiagnostic = () => {};`,
    "@/platform/server/operations/index": `import { controls } from "error-test-ports"; export const getSelectedDesktopServer = () => controls.selected; export async function listDesktopServerProfiles() { controls.reads++; return await controls.profiles; } export async function executeDesktopServerSwitch(options) { controls.switched = options; }`,
    "@/lib/posthog": `export const captureProductException = () => {};`,
    "@/components/ui/button": `import { createElement } from "react"; export function Button({ variant, ...props }) { return createElement("button", props); }`,
  };
  const result = await build({
    stdin: {
      contents: `export { default as RouteErrorPage } from "./route-error-page"; export { createElement } from "react"; export { createRoot } from "react-dom/client"; export { flushSync } from "react-dom"; export { controls } from "error-test-ports";`,
      resolveDir: sourcePath("/src/app/routing"),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    logLevel: "silent",
    plugins: [
      {
        name: "error-surface-ports",
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) =>
            path in mocks ? { path, namespace: "error-mock" } : undefined,
          );
          builder.onLoad({ filter: /./, namespace: "error-mock" }, ({ path }) => ({
            contents: mocks[path],
            resolveDir: sourcePath("/src/app/routing"),
            loader: "ts",
          }));
        },
      },
    ],
  });
  const tempDir = await mkdtemp(join(tmpdir(), "zilobase-route-error-"));
  try {
    const file = join(tempDir, "surface.mjs");
    await writeFile(file, result.outputFiles[0].text);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
