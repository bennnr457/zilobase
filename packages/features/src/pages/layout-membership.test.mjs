import assert from "node:assert/strict";
import test from "node:test";
import { resolvePageLayoutDatabaseId } from "./page-layouts.ts";
test("layout membership preserves target, resolved, cache and row-placement precedence", () => {
  const input = {
    pageId: "page",
    targetDatabaseId: "target",
    resolvedDatabaseId: "resolved",
    cachedRowDatabaseId: "cached",
    placements: [
      {
        parentKind: "database",
        itemKind: "page",
        itemId: "page",
        placementKind: "linked",
        parentId: "linked",
      },
      {
        parentKind: "database",
        itemKind: "page",
        itemId: "other",
        placementKind: "database_row",
        parentId: "other",
      },
      {
        parentKind: "database",
        itemKind: "page",
        itemId: "page",
        placementKind: "database_row",
        parentId: "row",
      },
    ],
  };
  assert.equal(resolvePageLayoutDatabaseId(input), "target");
  input.targetDatabaseId = null;
  assert.equal(resolvePageLayoutDatabaseId(input), "resolved");
  input.resolvedDatabaseId = null;
  assert.equal(resolvePageLayoutDatabaseId(input), "cached");
  input.cachedRowDatabaseId = null;
  assert.equal(resolvePageLayoutDatabaseId(input), "row");
  assert.equal(resolvePageLayoutDatabaseId({ ...input, pageId: null }), null);
});
