import assert from "node:assert/strict";
import test from "node:test";
import {
  createDatabaseRelationCommands,
  applyDatabaseRelationSelection,
} from "./relation-commands.ts";
const relation = {
  twoWayRelation: true,
  relatedDatabaseId: "related",
  relatedPropertyId: "reciprocal",
};
const related = {
  properties: [{ id: "binding", property: { id: "reciprocal", config: {} } }],
  rows: [{ id: "record", pageId: "target" }],
  values: [],
};
function runtime() {
  const calls = [];
  let created;
  const mutations = {
    addProperty: {
      mutate(input, options) {
        calls.push(["add", input]);
        created = options;
      },
    },
    updateProperty: {
      mutate(input) {
        calls.push(["config", input]);
      },
    },
    updateValue: {
      mutate(input) {
        calls.push(["value", input]);
      },
    },
  };
  return {
    calls,
    mutations,
    commands: createDatabaseRelationCommands(mutations),
    acknowledge: () => created.onSuccess({ property: { id: "created" } }),
  };
}
test("two-way relation creation links the new property only after its acknowledgement", () => {
  const r = runtime();
  const saved = [];
  r.commands.save(
    {
      selectedDatabase: { value: "related", label: "Related", pageName: "Host" },
      relationConfig: {},
      relatedPropertyName: " Backlink ",
      twoWayRelation: true,
      limit: "one_page",
      sourceDatabaseId: "source",
      sourceDatabaseName: "Source",
      sourcePropertyId: "property",
    },
    (config) => saved.push(config),
  );
  assert.deepEqual(saved, []);
  assert.deepEqual(r.calls, [
    [
      "add",
      {
        databaseId: "related",
        name: "Backlink",
        type: "relation",
        config: {
          relation: {
            limit: "one_page",
            relatedDatabaseId: "source",
            relatedDatabaseName: "Source",
            relatedPropertyId: "property",
            twoWayRelation: true,
          },
        },
      },
    ],
  ]);
  r.acknowledge();
  assert.equal(saved[0].relation.relatedPropertyId, "created");
  assert.equal(saved[0].relation.relatedPropertyName, "Backlink");
});
test("relation selection emits source changes before reciprocal writes", () => {
  const r = runtime();
  applyDatabaseRelationSelection(r.mutations, {
    page: { id: "target", name: "Target" },
    sourcePage: { id: "source", name: "Source" },
    selectedPageIds: [],
    propertyConfig: { relation },
    relatedDatabasePayload: related,
    relatedViewData: null,
    onPropertyConfigChange: () => r.calls.push(["source-config"]),
    onSelect: (value) => r.calls.push(["source-value", value]),
  });
  assert.deepEqual(r.calls.slice(0, 2), [["source-config"], ["source-value", ["target"]]]);
  assert.deepEqual(r.calls.at(-1), [
    "value",
    { databaseId: "related", propertyId: "reciprocal", rowId: "record", value: ["source"] },
  ]);
});
test("relation repair dispatches value updates before schema updates and skips unavailable payloads", () => {
  const r = runtime();
  const input = {
    databaseId: "source",
    databasePropertyId: "source-binding",
    payload: {
      properties: [{ id: "source-binding", property: { id: "property", config: { relation } } }],
      rows: [{ id: "source-row", pageId: "source" }],
      values: [{ pageId: "source", propertyId: "property", value: ["target"] }],
    },
    relatedDatabasePayload: related,
    propertyConfig: { relation },
  };
  assert.equal(r.commands.repair(input), true);
  assert.equal(r.calls[0][0], "value");
  assert.deepEqual(r.calls[0][1], {
    databaseId: "related",
    propertyId: "reciprocal",
    rowId: "record",
    value: ["source"],
  });
  assert.ok(r.calls.slice(1).some(([kind]) => kind === "config"));
  r.calls.length = 0;
  assert.equal(r.commands.repair({ ...input, payload: null }), false);
  assert.deepEqual(r.calls, []);
});
