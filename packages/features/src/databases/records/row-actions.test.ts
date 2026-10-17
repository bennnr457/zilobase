import assert from "node:assert/strict";
import { test } from "node:test";
import { orderDatabaseRowActions } from "./row-actions";
import { dataSourceCommandSchema } from "../core/entities";
test("batch duplication orders selected ancestors first while preserving independent displayed order", () => {
  const rows = [
    { id: "child", parentRowId: "parent" },
    { id: "other" },
    { id: "parent", parentRowId: "outside-selection" },
    { id: "sibling", parentRowId: "parent" },
  ];
  assert.deepEqual(
    orderDatabaseRowActions(rows).map((row) => row.id),
    ["parent", "child", "other", "sibling"],
  );
  assert.deepEqual(orderDatabaseRowActions(rows.slice(0, 1)), rows.slice(0, 1));
  assert.deepEqual(
    rows.map((row) => row.id),
    ["child", "other", "parent", "sibling"],
  );
});
test("record action commands validate destinations and explicit duplicate parent overrides", () => {
  assert.equal(
    dataSourceCommandSchema.parse({ type: "row.duplicate", rowId: "row", parentRowId: null }).type,
    "row.duplicate",
  );
  assert.equal(
    dataSourceCommandSchema.safeParse({
      type: "row.moveToPage",
      rowId: "row",
      pageId: "destination",
    }).success,
    true,
  );
  assert.equal(
    dataSourceCommandSchema.safeParse({ type: "row.moveToPage", rowId: "row" }).success,
    false,
  );
  assert.equal(
    dataSourceCommandSchema.safeParse({
      type: "row.duplicate",
      rowId: "row",
      content: "client content",
    }).success,
    false,
  );
});
