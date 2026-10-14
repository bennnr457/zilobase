import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function register({ assert, sourcePath, test }) {
  let loaded;
  const runtime = () => (loaded ??= loadRoutingRuntime(sourcePath));

  test("routing preserves authentication, onboarding and public access decisions", async () => {
    const { router, guards, controls, NetworkUnavailableError } = await runtime();
    const route = (path) => Object.values(router.routesById).find((item) => item.fullPath === path);
    const appRoute = router.routesById["/app"];
    const rejectsTo = (operation, to) =>
      assert.rejects(Promise.resolve().then(operation), (error) => error.options?.to === to);

    controls.reset();
    await rejectsTo(() => appRoute.options.beforeLoad(), "/login");
    controls.session = {
      user: { id: "user" },
      session: { id: "session", activeWorkspaceId: "workspace" },
    };
    controls.queryClient.clear();
    await rejectsTo(() => appRoute.options.beforeLoad(), "/onboarding");
    controls.workspaces = [{ id: "workspace", name: "Workspace", slug: "workspace" }];
    controls.queryClient.clear();
    await appRoute.options.beforeLoad();
    await rejectsTo(() => route("/settings").options.beforeLoad(), "/settings/preferences");
    await rejectsTo(() => route("/ai").options.beforeLoad(), "/recents");
    await rejectsTo(() => route("/connect").options.beforeLoad(), "/login");
    controls.desktop = true;
    route("/connect").options.beforeLoad();
    await rejectsTo(() => route("/otp").options.beforeLoad(), "/login");

    controls.reset();
    controls.responses["/pages/shared/published"] = { published: true };
    assert.equal(await guards.applyPageShareAccess("shared"), "public");
    controls.responses["/pages/shared/published"] = { published: false };
    await rejectsTo(() => guards.applyPageShareAccess("shared"), "/login");
    controls.session = { user: { id: "user" }, session: { id: "session" } };
    controls.queryClient.clear();
    await rejectsTo(() => guards.applyDatabaseShareAccess("shared"), "/onboarding");
    controls.offline = true;
    await assert.rejects(guards.applyPageShareAccess("shared"), NetworkUnavailableError);
    controls.reset();
  });

  test("routing preserves URL validation and disabled-feature redirects", async () => {
    const { router, controls } = await runtime();
    const route = (path) => Object.values(router.routesById).find((item) => item.fullPath === path);
    controls.reset();
    assert.deepEqual(
      route("/calendar").options.validateSearch({ view: "agenda", date: "2026-02-30", days: "4" }),
      {
        align: undefined,
        days: 4,
        workspace: undefined,
        connection: undefined,
        view: "week",
        date: undefined,
        binding: undefined,
        calendar: undefined,
        event: undefined,
      },
    );
    assert.deepEqual(route("/recents").options.validateSearch({ view: "trash" }), {
      view: "trash",
    });
    assert.deepEqual(route("/d/$databaseId").options.validateSearch({ view: " view " }), {
      view: "view",
    });
    assert.deepEqual(route("/settings/team").options.validateSearch({ tab: "guests" }), {
      tab: "guests",
    });
    assert.throws(
      () => route("/trash").options.beforeLoad(),
      (error) => error.options.to === "/recents" && error.options.search.view === "trash",
    );
    controls.reset();
  });
}

async function loadRoutingRuntime(sourcePath) {
  // Use the real router, queries, collections and domain decisions with in-memory
  // platform ports. Screens are not mounted by these beforeLoad integration tests.
  const ports = `
    import { QueryClient } from "@tanstack/react-query";
    import { createZilobaseClient } from "@zilobase/features";
    const client = createZilobaseClient({ deployment: "routing-test", queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }) });
    export const controls = {
      queryClient: client.queryClient,
      reset() { this.queryClient.clear(); this.session = { user: null, session: null }; this.workspaces = []; this.errors = {}; this.responses = {}; this.requests = []; this.sessionReads = 0; this.workspaceReads = 0; this.desktop = false; this.offline = false; this.hydrated = []; this.storageError = null; this.preferredWorkspace = null; }
    };
    controls.reset();
    export class NetworkUnavailableError extends Error { constructor() { super("Offline"); this.name = "NetworkUnavailableError"; } }
    export async function apiFetch(path) { controls.requests.push(path); if (controls.errors[path]) throw controls.errors[path]; return controls.responses[path] ?? null; }
    export const webAuthClient = {
      async getSession() { controls.sessionReads++; if (controls.errors.session) throw controls.errors.session; return controls.session; },
      async listWorkspaces() { controls.workspaceReads++; if (controls.errors.workspaces) throw controls.errors.workspaces; return controls.workspaces; }
    };
  `;
  const mocks = {
    "routing-test-ports": ports,
    "@/app/query-client": `export { controls } from "routing-test-ports"; import { controls } from "routing-test-ports"; export const queryClient = controls.queryClient;`,
    "@/app/providers/features-provider": `export { webAuthClient } from "routing-test-ports";`,
    "@/platform/network/api": `export { apiFetch, NetworkUnavailableError } from "routing-test-ports";`,
    "@/app/state/app-store": `import { controls } from "routing-test-ports"; export const useAppStore = { getState: () => ({ activeWorkspaceId: controls.preferredWorkspace }) };`,
    "@/platform/network/connectivity": `import { controls } from "routing-test-ports"; export const getConnectivityState = () => controls.offline ? "offline" : "online";`,
    "@/components/pages/cache/page-read-cache": `import { controls } from "routing-test-ports"; export async function hydratePageReadCache(input) { controls.hydrated.push(input); if (controls.storageError) throw controls.storageError; }`,
    "@/components/library/library-model": `export const getMostRecentItemPath = () => null;`,
    "@/platform/environment": `export const isFeatureEnabled = () => false;`,
    "@/components/desktop/index": `import { controls } from "routing-test-ports"; export const isDesktopApp = () => controls.desktop;`,
    "@/app/demo": `export const isHostedDemoRuntime = () => false;`,
    "@zilobase/edition-web": `export const editionWebModule = { routePrefix: "/edition", routes: [] };`,
    "./route-shell": `export const PendingPage = () => null; export const RootRouteShell = () => null;`,
    "./route-error-page": `export default () => null;`,
    "./edition-route-host": `export default () => null;`,
    "../shell/content/workspace-settings": `export default () => null;`,
  };
  const realComponents = new Set([
    "@/components/auth/google-auth",
    "@/components/workspaces/members/model/member-settings-tabs",
  ]);
  const result = await build({
    stdin: {
      contents: `export { router } from "./router"; export * as guards from "./guards"; export { controls, NetworkUnavailableError } from "routing-test-ports";`,
      resolveDir: sourcePath("/src/app/routing"),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    logLevel: "silent",
    define: {
      "import.meta.env": JSON.stringify({ DEV: false, VITE_API_URL: "https://api.zilobase.test" }),
    },
    plugins: [
      {
        name: "routing-platform-ports",
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) => {
            if (path in mocks) return { path, namespace: "routing-mock" };
            if (path.startsWith("@/components/") && !realComponents.has(path))
              return { path: "screen", namespace: "routing-mock" };
            if (path.startsWith("@/")) return { path: sourcePath(`/src/${path.slice(2)}.ts`) };
          });
          builder.onLoad({ filter: /./, namespace: "routing-mock" }, ({ path }) => ({
            contents: mocks[path] ?? "export default () => null;",
            resolveDir: sourcePath("/src/app/routing"),
            loader: "ts",
          }));
        },
      },
    ],
  });
  const tempDir = await mkdtemp(join(tmpdir(), "zilobase-routing-"));
  try {
    const file = join(tempDir, "runtime.mjs");
    await writeFile(file, result.outputFiles[0].text);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
