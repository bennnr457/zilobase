import assert from "node:assert/strict";
import test from "node:test";

test("unnamed kanban groups receive a unique Untitled name", async () => {
  const { getUntitledKanbanGroupName: name } = await import("./kanban-groups.ts");
  const option = (value) => ({ name: value, groupValue: value });
  assert.equal(name([]), "Untitled");
  assert.equal(name([option("Untitled")]), "Untitled 2");
  assert.equal(name([option(" untitled "), option("UNTITLED 2")]), "Untitled 3");
  assert.equal(name([{ name: "Different label", groupValue: "Untitled" }]), "Untitled 2");
  assert.equal(name([option("Untitled"), option("Untitled 3")]), "Untitled 2");
});
