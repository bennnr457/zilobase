import assert from "node:assert/strict";
import { test } from "node:test";
import { automationOperandValues, automationOperandFromValues } from "./trigger-operand.ts";

test("trigger operands preserve zero, false, entity identities and empty selections", () => {
  assert.deepEqual(automationOperandValues(0), ["0"]);
  assert.deepEqual(automationOperandValues(false), ["false"]);
  assert.deepEqual(automationOperandValues(undefined), []);
  assert.equal(automationOperandFromValues([], "text", "is"), undefined);
  assert.equal(automationOperandFromValues(["0"], "number", "is"), 0);
  assert.equal(automationOperandFromValues(["false"], "checkbox", "is"), false);
  for (const [propertyType, entityType] of [
    ["select", "option"],
    ["status", "option"],
    ["multi_select", "option"],
    ["person", "user"],
  ]) {
    const operand = automationOperandFromValues(["a", "b"], propertyType, "is");
    assert.deepEqual(operand, { entityType, ids: ["a", "b"], type: "entity_list" });
    assert.deepEqual(automationOperandValues(operand), ["a", "b"]);
    assert.deepEqual(automationOperandFromValues(["a"], propertyType, "is"), {
      entityType,
      id: "a",
      type: "entity",
    });
  }
  assert.deepEqual(automationOperandFromValues(["page"], "relation", "is"), {
    entityType: "page",
    id: "page",
    type: "entity",
  });
});

test("date conditions preserve range precision and relative date operands", () => {
  const values = ["2026-10-12", "2026-10-15"];
  const operand = automationOperandFromValues(values, "date", "is_between");
  assert.deepEqual(operand, {
    type: "date_range",
    start: "2026-10-12T00:00:00.000Z",
    end: "2026-10-15T00:00:00.000Z",
  });
  assert.deepEqual(automationOperandValues(operand), values);
  assert.equal(automationOperandFromValues([values[0]], "date", "is_between"), undefined);
  assert.deepEqual(automationOperandFromValues([values[0]], "date", "is"), {
    type: "date",
    precision: "date",
    value: "2026-10-12T00:00:00.000Z",
  });
  const relative = { amount: 1, direction: "next", type: "relative_date", unit: "month" };
  assert.deepEqual(
    automationOperandFromValues(automationOperandValues(relative), "date", "is_relative_to_today"),
    relative,
  );
});
