import assert from "node:assert/strict";
import test from "node:test";

test("database cell fill resolves vertical targets in either direction", async () => {
  const { getDatabaseCellFillRowIds } = await import("./cell-fill.ts");
  const rowIds = ["first", "second", "third", "fourth"];

  assert.deepEqual(getDatabaseCellFillRowIds(rowIds, "second", "fourth"), ["third", "fourth"]);
  assert.deepEqual(getDatabaseCellFillRowIds(rowIds, "third", "first"), ["first", "second"]);
  assert.deepEqual(getDatabaseCellFillRowIds(rowIds, "second", "second"), []);
});

test("database cell fill is limited to safely writable property kinds", async () => {
  const { isDatabasePropertyFillable } = await import("./cell-fill.ts");

  assert.equal(isDatabasePropertyFillable("status"), true);
  assert.equal(isDatabasePropertyFillable("number"), true);
  assert.equal(isDatabasePropertyFillable("date"), true);
  assert.equal(isDatabasePropertyFillable("formula"), false);
  assert.equal(isDatabasePropertyFillable("rollup"), false);
  assert.equal(isDatabasePropertyFillable("relation"), false);
});

test("database cell fill undo preserves values edited after filling", async () => {
  const { getUndoableDatabaseCellFillChanges } = await import("./cell-fill.ts");
  const changes = [
    {
      nextValue: "Done",
      pageId: "first-page",
      previousValue: "To do",
      propertyId: "status",
      propertyType: "status",
      rowId: "first-row",
    },
    {
      nextValue: "Done",
      pageId: "second-page",
      previousValue: "In progress",
      propertyId: "status",
      propertyType: "status",
      rowId: "second-row",
    },
  ];

  assert.deepEqual(
    getUndoableDatabaseCellFillChanges(changes, {
      "first-page:status": "Done",
      "second-page:status": "Blocked",
    }),
    [changes[0]],
  );
});

test("database cell fill redo preserves values edited after undo", async () => {
  const { getRedoableDatabaseCellFillChanges } = await import("./cell-fill.ts");
  const changes = [
    {
      nextValue: "Done",
      pageId: "first-page",
      previousValue: "To do",
      propertyId: "status",
      propertyType: "status",
      rowId: "first-row",
    },
    {
      nextValue: "Done",
      pageId: "second-page",
      previousValue: "In progress",
      propertyId: "status",
      propertyType: "status",
      rowId: "second-row",
    },
  ];

  assert.deepEqual(
    getRedoableDatabaseCellFillChanges(changes, {
      "first-page:status": "To do",
      "second-page:status": "Blocked",
    }),
    [changes[0]],
  );
});
