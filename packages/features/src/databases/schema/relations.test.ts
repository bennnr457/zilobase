import assert from "node:assert/strict";
import test from "node:test";
import { getRelationSelectionChange } from "./relations";

test("relation selection preserves limits, page summaries, and reciprocal sync decisions", () => {
  const page = { id: "target", name: "Target" };
  const sourcePage = { id: "source", name: "Source" };
  const input = {
    page,
    sourcePage,
    selectedPageIds: [],
    relatedDatabasePayload: null,
    propertyConfig: {},
  };
  const added = getRelationSelectionChange(input);
  assert.deepEqual(added.value, ["target"]);
  assert.ok("pageSummaries" in added.config);
  assert.equal(added.config.pageSummaries.target!.name, "Target");
  assert.deepEqual("relation" in added.config && added.config.relation, {
    syncStatus: "not_synced",
  });
  const removed = getRelationSelectionChange({ ...input, selectedPageIds: ["target"] });
  assert.deepEqual(removed.value, []);
  const unchanged = getRelationSelectionChange({
    ...input,
    selectedPageIds: ["target"],
    propertyConfig: { relation: { limit: "one_page", syncStatus: "synced" } },
  });
  assert.equal(unchanged.value, "target");
  assert.equal("relation" in unchanged.config && unchanged.config.relation.syncStatus, "synced");
  const reciprocal = getRelationSelectionChange({
    ...input,
    propertyConfig: {
      relation: {
        twoWayRelation: true,
        relatedDatabaseId: "related-db",
        relatedPropertyId: "reciprocal",
      },
    },
    relatedDatabasePayload: {
      properties: [{ id: "binding", property: { id: "reciprocal", config: {} } }],
      rows: [{ id: "record", pageId: "target" }],
      values: [],
    },
  });
  assert.equal(reciprocal.reciprocalUpdates[0]?.databaseId, "related-db");
  assert.deepEqual(reciprocal.reciprocalUpdates[0]?.value, ["source"]);
  assert.equal("relation" in reciprocal.config && reciprocal.config.relation.syncStatus, undefined);
});
