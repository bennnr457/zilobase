import assert from "node:assert/strict";
import test from "node:test";

import { getDatabaseDescription, getDatabaseEmoji, isDatabaseLocked } from "./appearance";

test("database lock is read from database config", () => {
  assert.equal(isDatabaseLocked({ config: { locked: true } }), true);
  assert.equal(isDatabaseLocked({ config: { locked: false } }), false);
});

test("database lock defaults safely for missing or malformed config", () => {
  assert.equal(isDatabaseLocked(undefined), false);
  assert.equal(isDatabaseLocked({ config: null }), false);
  assert.equal(isDatabaseLocked({ config: [] }), false);
});

test("database presentation reads its normalized data source config", () => {
  assert.equal(getDatabaseEmoji({ config: { emoji: "😢" } }), "😢");
  assert.equal(getDatabaseEmoji({ config: null }), null);
});

test("database descriptions retain text and default safely for older or malformed configs", () => {
  assert.equal(
    getDatabaseDescription({ config: { description: "Project notes\nNext steps" } }),
    "Project notes\nNext steps",
  );
  for (const database of [
    undefined,
    null,
    {},
    { config: null },
    { config: [] },
    { config: { description: 3 } },
  ]) {
    assert.equal(getDatabaseDescription(database), "");
  }
});
