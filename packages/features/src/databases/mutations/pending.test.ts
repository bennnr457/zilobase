import assert from "node:assert/strict";
import test from "node:test";

import { DatabaseCommandState } from "./pending";

test("pending counts, errors and cleanup are isolated by controller", () => {
  const first = new DatabaseCommandState();
  const second = new DatabaseCommandState();
  const target = { hostDatabaseId: "same-host" };
  first.begin([target]);
  assert.equal(first.hasPending(), true);
  assert.equal(second.hasPending(), false);
  first.end([target], new Error("first session failed"));
  assert.equal(second.get(target).error, null);
  first.clear();
  assert.equal(first.get(target).error, null);
});

test("per-target pendingCount tracks independently", () => {
  const state = new DatabaseCommandState();
  try {
    const target = { hostDatabaseId: "database-1" };
    const other = { hostDatabaseId: "database-2" };
    state.begin([target]);
    assert.equal(state.get(target).pendingCount, 1);
    assert.equal(state.get(target).isPending, true);
    assert.equal(state.get(other).pendingCount, 0);
    state.end([target]);
    assert.equal(state.get(target).isPending, false);
  } finally {
    state.clear();
  }
});

test("error sticks until same target succeeds", () => {
  const state = new DatabaseCommandState();
  try {
    const target = { hostDatabaseId: "database-1", rowId: "row-1" };
    const unrelated = { hostDatabaseId: "database-1", rowId: "row-2" };
    state.begin([target]);
    state.end([target], new Error("failed"));
    assert.match(state.get(target).error?.message ?? "", /failed/);
    // Unrelated success does not clear
    state.begin([unrelated]);
    state.end([unrelated]);
    assert.match(state.get(target).error?.message ?? "", /failed/);
    // Same target next start clears error
    state.begin([target]);
    assert.equal(state.get(target).error, null);
    state.end([target]);
    assert.equal(state.get(target).error, null);
  } finally {
    state.clear();
  }
});

test("target subscriptions ignore unrelated commands, coalesce shared listeners and unsubscribe", () => {
  const state = new DatabaseCommandState();
  const a = { dataSourceId: "a" },
    b = { dataSourceId: "b" };
  let calls = 0;
  const listener = () => calls++;
  const stop = state.subscribeTo(a, listener);
  state.subscribeTo({ ...a, rowId: "row" }, listener);
  state.begin([b]);
  assert.equal(calls, 0);
  state.begin([a, { ...a, rowId: "row" }]);
  assert.equal(calls, 1);
  stop();
  state.end([a]);
  assert.equal(calls, 1);
  state.clear();
  assert.equal(calls, 2);
});
