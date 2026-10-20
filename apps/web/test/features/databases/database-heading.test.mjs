import { build } from "esbuild";
import { createRequire } from "node:module";
import { parseHTML } from "linkedom";
import ts from "typescript";

export function register({ assert, appPath, readSource, sourcePath, test }) {
  test("database heading follows the selected source without adding a second title", async () => {
    const source = await readSource("/src/sections/databases/database-screen.tsx");
    const parsed = ts.createSourceFile(
      "screen.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    // Stub surrounding screens and visual controls, keeping the real main pane,
    // React lifecycle and title draft/save behavior under test.
    const mocks = {};
    for (const node of parsed.statements) {
      if (!ts.isImportDeclaration(node) || !node.importClause || node.importClause.isTypeOnly)
        continue;
      const path = node.moduleSpecifier.text;
      if (path === "react" || path.endsWith("use-page-title-draft")) continue;
      const names =
        node.importClause.namedBindings?.elements
          ?.filter((item) => !item.isTypeOnly)
          .map((item) => (item.propertyName ?? item.name).text) ?? [];
      mocks[path] = names.map((name) => `export const ${name} = () => null;`).join("\n");
    }
    mocks["heading-runtime"] = "export const runtime = { payloads: {}, calls: [] };";
    mocks["@/lib/utils"] = "export const cn = (...values) => values.filter(Boolean).join(' ');";
    mocks["@zilobase/features/databases"] = `
      export const getDatabaseCover = record => record?.config?.cover ?? '';
      export const getDatabaseEmoji = record => record?.config?.emoji ?? '';
      export const getDatabaseDescription = record => record?.config?.description ?? '';
      export const isDatabaseLocked = record => record?.config?.locked === true;
    `;
    mocks["@zilobase/features/databases/react"] = `
      import {runtime} from 'heading-runtime';
      export const useDatabaseMetadata = id => ({data: runtime.payloads[id]});
      const mutation = kind => ({mutate: input => runtime.calls.push({kind, input}), mutateAsync: async input => {
        runtime.calls.push({kind, input});
        if (runtime.pendingSave) await runtime.pendingSave;
      }});
      export const useUpdateDatabase = () => mutation('container');
      export const useUpdateDataSource = () => mutation('source');
    `;
    mocks["@zilobase/features/pages/react"] = `
      export const usePage = () => ({data: undefined});
      export const usePageAccessLevel = () => ({data: undefined});
    `;
    mocks["./views/hooks/use-database-view-navigation"] = `
      export const useDatabaseViewNavigation = ({requestedViewId}) => ({activeViewId: requestedViewId, selectView() {}});
    `;
    mocks["../pages/components/page-metadata"] = `
      import {createElement} from 'react';
      import {runtime} from 'heading-runtime';
      export function PageMetadata(props) {
        runtime.heading = props;
        return createElement('h1', null, props.title);
      }
    `;
    mocks["./views/shared/components/database-view"] = `
      import {createElement} from 'react';
      import {runtime} from 'heading-runtime';
      export function DatabaseView(props) {
        runtime.view = props;
        return props.showTitle ? createElement('h2', null, 'Duplicate source title') : null;
      }
    `;
    const result = await build({
      stdin: {
        contents: `export {DatabaseMainPane} from './src/sections/databases/database-screen';
          export {runtime} from 'heading-runtime';
          export {createElement} from 'react';
          export {createRoot} from 'react-dom/client';
          export {flushSync} from 'react-dom';`,
        resolveDir: appPath("/"),
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      jsx: "automatic",
      logLevel: "silent",
      plugins: [
        {
          name: "heading-controls",
          setup(builder) {
            builder.onResolve({ filter: /./ }, ({ path }) => {
              if (path in mocks) return { path, namespace: "heading-mock" };
              if (path.endsWith("use-page-title-draft"))
                return {
                  path: sourcePath("/src/sections/pages/editor/hooks/use-page-title-draft.ts"),
                };
            });
            builder.onLoad({ filter: /./, namespace: "heading-mock" }, ({ path }) => ({
              contents: mocks[path],
              resolveDir: appPath("/"),
              loader: "ts",
            }));
          },
        },
      ],
    });
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
    Object.assign(globalThis, { window, document });
    const module = { exports: {} };
    new Function("require", "module", "exports", result.outputFiles[0].text)(
      createRequire(import.meta.url),
      module,
      module.exports,
    );
    const { DatabaseMainPane, runtime, createElement, createRoot, flushSync } = module.exports;
    const root = createRoot(document.getElementById("root"));
    const settle = (delay = 20) => new Promise((resolve) => setTimeout(resolve, delay));
    const owned = {
      id: "owned",
      parentDatabaseId: "host",
      name: "Projects",
      config: { emoji: "📋", description: "Our projects" },
    };
    const linked = {
      id: "linked",
      parentDatabaseId: "other",
      name: "Roadmap",
      config: { emoji: "🗺️", description: "Product plans" },
    };
    const host = {
      database: { id: "host", name: "New database", accessLevel: "full" },
      dataSources: [owned],
      views: [{ id: "table", dataSourceId: "owned" }],
    };
    runtime.payloads.host = host;
    runtime.payloads.other = {
      database: { id: "other", name: "Other container", accessLevel: "full" },
    };
    const render = (view, options = {}) =>
      flushSync(() =>
        root.render(
          createElement(DatabaseMainPane, {
            databaseId: "host",
            activeDatabaseViewId: view,
            onOpenPage() {},
            ...options,
          }),
        ),
      );
    const expectTitle = (title) => {
      assert.equal(document.querySelector("h1").textContent, title);
      assert.equal(document.querySelectorAll("h1, h2").length, 1);
      assert.equal(runtime.view.showTitle, false);
      assert.equal(runtime.view.onShowTitleChange, undefined);
    };
    try {
      render();
      expectTitle("Projects");
      host.dataSources.push(linked);
      host.views.push({ id: "linked-table", dataSourceId: "linked" });
      render();
      expectTitle("Projects");
      render("linked-table");
      expectTitle("Roadmap");
      assert.equal(runtime.heading.icon, "🗺️");
      assert.equal(runtime.heading.description, "Product plans");
      assert.equal(runtime.heading.databaseId, "other");
      assert.equal(runtime.heading.titleSuffix.props["aria-label"], "Linked from Roadmap");
      flushSync(() => runtime.heading.onTitleChange("Renamed roadmap"));
      let finish;
      runtime.pendingSave = new Promise((resolve) => {
        finish = resolve;
      });
      await settle(650);
      assert.deepEqual(runtime.calls, [
        { kind: "source", input: { databaseId: "linked", name: "Renamed roadmap" } },
      ]);
      render("table");
      expectTitle("Projects");
      finish();
      await settle();
      expectTitle("Projects");
      runtime.pendingSave = null;
      linked.name = "Renamed roadmap";
      render("linked-table");
      expectTitle("Renamed roadmap");
      runtime.heading.onIconChange("⭐");
      assert.deepEqual(runtime.calls.at(-1), {
        kind: "source",
        input: {
          databaseId: "linked",
          configuration: [{ operation: "set", path: ["emoji"], value: "⭐" }],
        },
      });
      runtime.payloads.other.database.accessLevel = "view";
      render("linked-table");
      assert.equal(runtime.heading.editable, false);
      runtime.payloads.other.database.accessLevel = "full";
      runtime.payloads.other.database.deletedAt = "deleted";
      render("linked-table");
      assert.equal(runtime.heading.editable, false);
      delete runtime.payloads.other.database.deletedAt;
      render("linked-table", { readOnly: true });
      assert.equal(runtime.heading.editable, false);
      render("missing-view");
      expectTitle("Projects");
      render(undefined, { embedded: true });
      flushSync(() => runtime.view.onActiveViewIdChange("linked-table"));
      expectTitle("Renamed roadmap");
      host.views = [];
      host.dataSources = [];
      render();
      expectTitle("New database");
      flushSync(() => runtime.heading.onTitleChange("Empty database"));
      await settle(650);
      assert.deepEqual(runtime.calls.at(-1), {
        kind: "container",
        input: { databaseId: "host", name: "Empty database" },
      });
    } finally {
      flushSync(() => root.unmount());
      await settle();
      for (const key of Object.getOwnPropertyNames(globalThis))
        if (!saved[key]) delete globalThis[key];
      Object.defineProperties(globalThis, saved);
    }
  });
}
