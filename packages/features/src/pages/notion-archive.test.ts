import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { importNotionArchive } from "./notion-archive";
import { NotionImportError, findNotionLinkedPageId } from "./notion-import";

test("archive import expands nested zips and creates parents before children without a DOM", async () => {
  const created: { name: string; parentItemId?: string }[] = [];
  const updated: string[] = [];
  const content = zipSync({
    "Root/Child.html": strToU8("Child"),
    "Root.html": strToU8("Root"),
    "Nested.zip": zipSync({ "Page.html": strToU8("Nested") }),
    "__MACOSX/ignored.md": strToU8("ignored"),
    "index.html": strToU8("index"),
    "Empty.html": strToU8(""),
  });
  const result = await importNotionArchive({
    content,
    workspaceId: "workspace",
    hasImportableBody: (html) => Boolean(html),
    normalizeHtml: (html) => ({ title: html, content: html, skippedAssets: 0, warnings: [] }),
    createPage: async (input) => {
      created.push(input);
      return { id: `p${created.length}` };
    },
    updatePage: async (input) => {
      updated.push(input.id);
    },
  });
  assert.deepEqual(
    created.map((page) => page.name),
    ["Root", "Child", "Nested"],
  );
  assert.equal(created[1]?.parentItemId, "p1");
  assert.deepEqual(updated, ["p1", "p2", "p3"]);
  assert.equal(result.entryPageId, "p1");
  const map = new Map([["Root/Child.html", "p2"]]);
  assert.equal(findNotionLinkedPageId("./Root/Child.html#heading", map), "p2");
  assert.equal(findNotionLinkedPageId("../Root/Child.html", map), "p2");
});

test("archive validation rejects Markdown and empty exports before creating pages", async () => {
  const archives: Record<string, Uint8Array>[] = [
    { "Nested.zip": zipSync({ "Page.md": strToU8("markdown") }) },
    { "index.html": strToU8("index") },
  ];
  for (const entries of archives) {
    await assert.rejects(
      importNotionArchive({
        content: zipSync(entries),
        workspaceId: "workspace",
        hasImportableBody: () => true,
        normalizeHtml: () => assert.fail("unexpected normalization"),
        createPage: async () => assert.fail("unexpected write"),
        updatePage: async () => assert.fail("unexpected update"),
      }),
      NotionImportError,
    );
  }
});
