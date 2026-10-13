import assert from "node:assert/strict";
import test from "node:test";
import { propertyEditedTriggerSelection } from "./definition-model.ts";
test("any-choice edits materialize all option IDs with the property's matching operator", () => {
  const draft = {
    id: "trigger",
    propertyId: "property",
    operands: ["chosen"],
    operator: "was_edited",
    type: "property_edited",
  };
  for (const type of ["select", "status", "multi_select"]) {
    assert.deepEqual(
      propertyEditedTriggerSelection(draft, { type, options: [{ id: "a" }, { id: "b" }] }),
      {
        type: "property_edited",
        propertyId: "property",
        operands: ["a", "b"],
        operator: type === "multi_select" ? "contains" : "is",
      },
    );
  }
  assert.deepEqual(
    propertyEditedTriggerSelection({ ...draft, operator: "is" }, { type: "select", options: [] })
      .operands,
    ["chosen"],
  );
  assert.equal(
    propertyEditedTriggerSelection(draft, { type: "text", options: [] }).operator,
    "was_edited",
  );
  assert.deepEqual(draft.operands, ["chosen"]);
});
