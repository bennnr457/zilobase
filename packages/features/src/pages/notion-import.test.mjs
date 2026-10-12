import assert from "node:assert/strict";
import { test } from "node:test";
import { importNotionPages } from "./notion-import.ts";

test("Notion import creates the hierarchy before resolving content links", async () => {
  const calls = [];
  const parsed = (title) => ({
    title,
    content: null,
    skippedAssets: 1,
    warnings: ["asset skipped"],
  });
  const result = await importNotionPages({
    workspaceId: "workspace",
    entries: [
      { path: "Parent.html", html: "Parent" },
      { path: "Parent/Child.html", html: "Child" },
    ],
    createPage: async (input) => {
      calls.push(["create", input]);
      return { id: input.name.toLowerCase() };
    },
    normalizeHtml: (html, options) => {
      if (options) assert.equal(options.pagePathMap.get("Parent/Child.html"), "child");
      return {
        ...parsed(html),
        content: { linkedPage: options?.pagePathMap.get("./Parent.html") },
      };
    },
    updatePage: async (input) => {
      calls.push(["update", input]);
    },
  });
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["create", "create", "update", "update"],
  );
  assert.equal(calls[1][1].parentItemId, "parent");
  assert.deepEqual(calls[2][1], { id: "parent", content: { linkedPage: "parent" } });
  assert.deepEqual(result, {
    createdPageIds: ["parent", "child"],
    entryPageId: "parent",
    skippedAssets: 2,
    warnings: ["asset skipped"],
  });
});

test("Notion import propagates create failures before writing any content", async () => {
  const error = new Error("denied");
  let writes = 0;
  await assert.rejects(
    importNotionPages({
      workspaceId: "workspace",
      entries: [{ path: "Page.html", html: "Page" }],
      normalizeHtml: () => ({ title: "Page", content: null, skippedAssets: 0, warnings: [] }),
      createPage: async () => {
        throw error;
      },
      updatePage: async () => {
        writes++;
      },
    }),
    (failure) => failure === error,
  );
  assert.equal(writes, 0);
});
