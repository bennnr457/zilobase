import assert from "node:assert/strict";
import { test } from "node:test";
import { getDatabaseSharingAccessLevel, getSharingRuleState } from "./sharing-model.ts";

test("public wildcard publishes an item while public rules stay out of individual sharing", () => {
  const user = { targetType: "user", targetId: "user-1", accessLevel: "edit" };
  const publicRule = { targetType: "public", targetId: "*", accessLevel: "view" };
  assert.deepEqual(getSharingRuleState([publicRule, user]), {
    isPublished: true,
    sharingRules: [user],
  });
  assert.deepEqual(getSharingRuleState([{ ...publicRule, targetId: "specific" }]), {
    isPublished: false,
    sharingRules: [],
  });
  assert.deepEqual(getSharingRuleState([]), { isPublished: false, sharingRules: [] });
});

test("database sharing maps comment access to view and preserves supported access levels", () => {
  assert.equal(getDatabaseSharingAccessLevel("comment"), "view");
  for (const level of ["view", "edit", "full"])
    assert.equal(getDatabaseSharingAccessLevel(level), level);
});
