import assert from "node:assert/strict";
import test from "node:test";
import { getRecordDropChange } from "./record-drop.ts";
test("drop commands preserve semantic anchors, source scope, group values and empty titles", () => {
  const move = {
    rowId: "row",
    pageId: "page",
    afterRowId: "after",
    beforeRowId: null,
    pageTitle: "",
    group: { propertyId: "status", serializedValue: ["Done"] },
  };
  assert.deepEqual(getRecordDropChange("host", "source", move, "view"), {
    databaseId: "host",
    dataSourceId: "source",
    rowId: "row",
    placement: { afterRowId: "after", beforeRowId: null },
    title: "",
    clearSortViewId: "view",
    valuesByPropertyId: { status: ["Done"] },
  });
  const plain = getRecordDropChange("host", "source", {
    ...move,
    pageTitle: undefined,
    group: undefined,
  });
  assert.equal("title" in plain, false);
  assert.equal("valuesByPropertyId" in plain, false);
  assert.equal("clearSortViewId" in plain, false);
});
