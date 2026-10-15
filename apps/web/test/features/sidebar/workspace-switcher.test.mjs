import { build } from "esbuild";
import { parseHTML } from "linkedom";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function register({ readSource, sourcePath, assert, test }) {
  test("desktop workspace switcher groups current and other servers", async () => {
    const source = await readSource("/src/app/shell/sidebar/workspace-switcher.tsx");
    assert.match(source, /isDesktopApp\(\)/);
    assert.match(source, /Connect another server/);
    assert.match(source, /OtherServerSection/);
    assert.match(source, /listDesktopServerProfiles/);
    assert.match(source, /executeDesktopServerSwitch/);
    assert.match(source, /isWorkspacePinned && !isDesktop/);
  });

  test("other-server rows are desktop-gated and web still has workspaces", async () => {
    const source = await readSource("/src/app/shell/sidebar/workspace-switcher.tsx");
    assert.match(source, /Workspaces/);
    assert.match(source, /Add workspace/);
    assert.match(source, /isDesktop[\s\S]*otherProfiles\.map/);
  });
  test("workspace Effects retain profile cleanup, debounced snapshots and ordered form completion", async () => {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
    Object.assign(globalThis, { window, document });
    window.location = { pathname: "/p/page", search: "?view=current" };
    let fixture;
    let root;
    const settle = (delay = 10) => new Promise((resolve) => setTimeout(resolve, delay));
    try {
      fixture = await loadSwitcher(sourcePath);
      const { WorkspaceSwitcher, createElement, createRoot, flushSync, controls } = fixture;
      const deferred = () => {
        let resolve;
        const promise = new Promise((done) => {
          resolve = done;
        });
        return { promise, resolve };
      };
      let pending = deferred();
      controls.profiles = pending.promise;
      root = createRoot(document.getElementById("root"));
      const render = () => flushSync(() => root.render(createElement(WorkspaceSwitcher)));
      render();
      assert.equal(controls.reads, 1);
      pending.resolve({
        profiles: [
          {
            active: false,
            server: {
              instanceId: "other",
              displayName: "Other server",
              apiOrigin: "https://other.test",
            },
            workspaces: [],
            hasCredentials: true,
          },
        ],
      });
      await settle();
      assert.match(document.body.textContent, /Other server/);
      await settle(450);
      assert.deepEqual(controls.snapshots, [
        {
          lastActiveWorkspaceId: "workspace",
          lastPath: "/p/page?view=current",
          workspaces: [{ id: "workspace", name: "Workspace" }],
        },
      ]);

      Object.defineProperty(globalThis, "FormData", {
        configurable: true,
        value: class {
          get() {
            return " New workspace ";
          }
        },
      });
      const form = document.querySelector("form");
      form.reset = () => controls.calls.push("form.reset");
      let finish;
      controls.create = new Promise((resolve) => {
        finish = resolve;
      });
      form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      assert.deepEqual(controls.calls, ["create:New workspace"]);
      finish({ id: "new" });
      await settle();
      assert.deepEqual(controls.calls, ["create:New workspace", "form.reset", "navigate:/recents"]);
      controls.calls = [];
      controls.createFailure = new Error("Workspace creation denied");
      form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      await settle();
      assert.deepEqual(controls.calls, ["create:New workspace"]);
      flushSync(() => root.unmount());

      pending = deferred();
      controls.profiles = pending.promise;
      root = createRoot(document.getElementById("root"));
      render();
      controls.desktop = false;
      render();
      pending.resolve({
        profiles: [
          {
            active: false,
            server: {
              instanceId: "stale",
              displayName: "Stale server",
              apiOrigin: "https://stale.test",
            },
            workspaces: [],
          },
        ],
      });
      await settle();
      controls.desktop = true;
      const next = deferred();
      controls.profiles = next.promise;
      render();
      assert.doesNotMatch(document.body.textContent, /Stale server/);
      next.resolve({ profiles: [] });
      await settle();
      flushSync(() => root.unmount());
      const written = controls.snapshots.length;
      await settle(450);
      assert.equal(controls.snapshots.length, written, "unmounted profile timers cannot write");
    } finally {
      if (root) fixture.flushSync(() => root.unmount());
      await settle();
      for (const key of Object.getOwnPropertyNames(globalThis))
        if (!saved[key]) delete globalThis[key];
      Object.defineProperties(globalThis, saved);
    }
  });
}

async function loadSwitcher(sourcePath) {
  const part = (names) =>
    `import { createElement } from "react"; const Part = ({children, onClick}) => createElement("div", {onClick}, children); export { ${names.map((name) => `Part as ${name}`).join(", ")} };`;
  const mocks = {
    "switcher-ports": `export const controls = { desktop: true, reads: 0, snapshots: [], calls: [], workspaces: [{id:"workspace",name:"Workspace"}] };`,
    "@tanstack/react-router": `import { controls } from "switcher-ports"; export const useNavigate = () => options => { controls.calls.push("navigate:" + options.to); return Promise.resolve(); };`,
    "@/components/desktop/index": `import { controls } from "switcher-ports"; export const isDesktopApp = () => controls.desktop;`,
    "@/components/desktop/ui": `export const DesktopConnectServerDialog = () => null;`,
    "@/platform/network/api": `export const getApiErrorMessage = error => error.message;`,
    "@/platform/server/operations/index": `import { controls } from "switcher-ports"; export const getSelectedDesktopServer = () => ({instanceId:"current",displayName:"Current",apiOrigin:"https://current.test"}); export async function listDesktopServerProfiles() { controls.reads++; return await controls.profiles; } export async function updateDesktopServerProfileSnapshot(input) { controls.snapshots.push(input); } export async function executeDesktopServerSwitch() {}`,
    "@zilobase/features/auth/react": `export const useSession = () => ({data:{workspacePinned:false}});`,
    "@zilobase/features/workspaces/react": `import { controls } from "switcher-ports"; export const useWorkspaces = () => ({data:controls.workspaces}); export const useActiveWorkspaceId = () => "workspace"; export const useSetActiveWorkspace = () => ({mutate(){}}); export const useCreateWorkspace = () => ({reset(){},async mutateAsync(name) { controls.calls.push("create:"+name); if (controls.createFailure) throw controls.createFailure; return await controls.create; }});`,
    "@/components/icons": part([
      "Building2Icon",
      "CheckIcon",
      "ChevronDownIcon",
      "PlusIcon",
      "ServerIcon",
      "Settings2Icon",
    ]),
    "@/components/ui/button": part(["Button"]),
    "@/components/ui/dialog": part([
      "Dialog",
      "DialogContent",
      "DialogDescription",
      "DialogFooter",
      "DialogHeader",
      "DialogTitle",
    ]),
    "@/components/ui/dropdrawer": part([
      "DropDrawer",
      "DropDrawerContent",
      "DropDrawerItem",
      "DropDrawerLabel",
      "DropDrawerSeparator",
      "DropDrawerShortcut",
      "DropDrawerTrigger",
    ]),
    "@/components/ui/sidebar": part(["SidebarMenu", "SidebarMenuButton", "SidebarMenuItem"]),
    "@/components/ui/field": part(["Field", "FieldError", "FieldGroup", "FieldLabel"]),
    "@/components/ui/input": part(["Input"]),
  };
  const result = await build({
    stdin: {
      contents: `export { WorkspaceSwitcher } from "./workspace-switcher"; export { createElement } from "react"; export { createRoot } from "react-dom/client"; export { flushSync } from "react-dom"; export { controls } from "switcher-ports";`,
      resolveDir: sourcePath("/src/app/shell/sidebar"),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    logLevel: "silent",
    plugins: [
      {
        name: "switcher-ports",
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) =>
            path in mocks ? { path, namespace: "switcher-mock" } : undefined,
          );
          builder.onLoad({ filter: /./, namespace: "switcher-mock" }, ({ path }) => ({
            contents: mocks[path],
            resolveDir: sourcePath("/src/app/shell/sidebar"),
            loader: "ts",
          }));
        },
      },
    ],
  });
  const directory = await mkdtemp(join(tmpdir(), "zilobase-switcher-"));
  try {
    const path = join(directory, "runtime.mjs");
    await writeFile(path, result.outputFiles[0].text);
    return await import(pathToFileURL(path).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
