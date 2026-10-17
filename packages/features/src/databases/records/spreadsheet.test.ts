import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDatabaseSpreadsheetHistoryAction,
  formatDatabaseSpreadsheetValue,
  isDatabaseSpreadsheetWritable,
  parseDatabaseSpreadsheetValue,
  type DatabaseSpreadsheetChange,
} from "./spreadsheet";
import type { DatabasePropertyValue } from "../schema/property-values";
const field = (type: string, options: Array<{ id: string; name: string }> = []) => ({
  id: "field",
  position: 0,
  property: { id: "property", name: "Property", type, config: { options } },
});

test("spreadsheet input preserves text and validates numbers/booleans without destructive coercion", () => {
  assert.equal(parseDatabaseSpreadsheetValue(field("text"), "  Text\t\n🙂  "), "  Text\t\n🙂  ");
  for (const valid of ["0", "-12.5", ".25", "+7"])
    assert.equal(parseDatabaseSpreadsheetValue(field("number"), valid), valid);
  for (const invalid of ["12abc", "NaN", "Infinity", "1,000", "0x12"])
    assert.equal(parseDatabaseSpreadsheetValue(field("number"), invalid), undefined);
  assert.equal(parseDatabaseSpreadsheetValue(field("number"), " "), "");
  for (const yes of ["true", "YES", "1", "checked"])
    assert.equal(parseDatabaseSpreadsheetValue(field("checkbox"), yes), "true");
  for (const no of ["false", "NO", "0", "unchecked"])
    assert.equal(parseDatabaseSpreadsheetValue(field("checkbox"), no), "false");
  assert.equal(parseDatabaseSpreadsheetValue(field("checkbox"), "perhaps"), undefined);
});

test("clipboard dates and inclusive ranges preserve civil values through midnight and DST", () => {
  const date = field("date");
  for (const value of [
    "2026-10-17",
    "2026-03-08T01:30",
    "2026-11-01T01:30",
    "2026-10-17T23:30:00-04:00",
    ["2026-03-07", "2026-03-09"],
    ["2026-10-17T23:30", "2026-10-18T01:30"],
  ]) {
    assert.deepEqual(
      parseDatabaseSpreadsheetValue(date, formatDatabaseSpreadsheetValue(value)),
      value,
    );
  }
  assert.deepEqual(parseDatabaseSpreadsheetValue(date, "2026-10-17 → 2026-10-19"), [
    "2026-10-17",
    "2026-10-19",
  ]);
  for (const invalid of [
    "2026-02-30",
    "2026-02-30T01:00Z",
    "2026-13-01",
    "2026-10-17T25:00",
    "not a date",
    '["2026-10-19","2026-10-17"]',
  ])
    assert.equal(parseDatabaseSpreadsheetValue(date, invalid), undefined);
});

test("options and people resolve existing identities and reject unknown or ambiguous labels", () => {
  const options = [
    { id: "a", name: "With, comma" },
    { id: "b", name: "Second" },
  ];
  assert.equal(parseDatabaseSpreadsheetValue(field("select", options), "a"), "With, comma");
  assert.equal(parseDatabaseSpreadsheetValue(field("status", options), "SECOND"), "Second");
  assert.equal(
    parseDatabaseSpreadsheetValue(
      field("select", [
        { id: "a", name: "b" },
        { id: "b", name: "Other" },
      ]),
      "b",
    ),
    "b",
  );
  const values = ["With, comma", "Second"];
  assert.deepEqual(
    parseDatabaseSpreadsheetValue(
      field("multi_select", options),
      formatDatabaseSpreadsheetValue(values),
    ),
    values,
  );
  assert.equal(parseDatabaseSpreadsheetValue(field("select", options), "New option"), undefined);
  const people = [
    { id: "ada", name: "Ada" },
    { id: "a", name: "Sam" },
    { id: "b", name: "Sam" },
  ];
  assert.deepEqual(parseDatabaseSpreadsheetValue(field("person"), "ADA", people), ["ada"]);
  assert.deepEqual(parseDatabaseSpreadsheetValue(field("person"), '["a","b"]', people), ["a", "b"]);
  assert.equal(parseDatabaseSpreadsheetValue(field("person"), "Sam", people), undefined);
  assert.equal(parseDatabaseSpreadsheetValue(field("person"), "Someone else", people), undefined);
});

test("spreadsheet writes cannot replace computed, file, relation, or system values", () => {
  for (const type of [
    "formula",
    "rollup",
    "created_time",
    "edited_time",
    "files",
    "relation",
    "button",
    "id",
  ]) {
    assert.equal(isDatabaseSpreadsheetWritable(type), false, type);
    assert.equal(parseDatabaseSpreadsheetValue(field(type), ""), undefined, type);
    assert.equal(parseDatabaseSpreadsheetValue(field(type), "arbitrary"), undefined, type);
  }
});

test("mixed title/property batches undo and redo once without overwriting failed or remote edits", () => {
  const changes: DatabaseSpreadsheetChange[] = [
    {
      kind: "title",
      rowId: "r1",
      pageId: "p1",
      previousValue: "Old title",
      nextValue: "New title",
    },
    {
      kind: "property",
      rowId: "r1",
      pageId: "p1",
      propertyId: "number",
      propertyType: "number",
      previousValue: "1",
      nextValue: "2",
    },
    {
      kind: "property",
      rowId: "r2",
      pageId: "p2",
      propertyId: "text",
      propertyType: "text",
      previousValue: "Old",
      nextValue: "Failed",
    },
  ];
  const state: Record<string, DatabasePropertyValue> = {
    title: "New title",
    number: "2",
    text: "Old",
  };
  let scopeActive = true,
    batches = 0;
  const key = (change: DatabaseSpreadsheetChange) =>
    change.kind === "title" ? "title" : change.propertyId;
  const action = createDatabaseSpreadsheetHistoryAction({
    label: "Paste",
    changes,
    readValue: (change) => (scopeActive ? state[key(change)] : undefined),
    save: (change, value) => {
      state[key(change)] = value;
    },
    runWithoutRecording: (work) => {
      batches++;
      work();
    },
  });
  assert.equal(action.undo(), true);
  assert.deepEqual(state, { title: "Old title", number: "1", text: "Old" });
  state.number = "Remote edit";
  assert.equal(action.redo(), true);
  assert.deepEqual(state, { title: "New title", number: "Remote edit", text: "Old" });
  scopeActive = false;
  assert.equal(action.undo(), false);
  assert.deepEqual(state, { title: "New title", number: "Remote edit", text: "Old" });
  assert.equal(batches, 3);
});
