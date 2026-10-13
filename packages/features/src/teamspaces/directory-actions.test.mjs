import assert from "node:assert/strict";
import test from "node:test";
import { archiveTeamspaces, readTeamspaceInvitation } from "./directory-actions.ts";
test("bulk archiving runs sequentially and stops at the first rejection", async () => {
  const calls = [];
  const first = Promise.withResolvers();
  const run = archiveTeamspaces(
    async (input) => {
      calls.push(input.teamspaceId);
      if (input.teamspaceId === "a") await first.promise;
      else throw new Error("denied");
    },
    "workspace",
    ["a", "b", "c"],
  );
  assert.deepEqual(calls, ["a"]);
  first.resolve();
  await assert.rejects(run, /denied/);
  assert.deepEqual(calls, ["a", "b"]);
});
test("teamspace invitation parsing takes explicit search and retains first-value parsing", () => {
  assert.deepEqual(readTeamspaceInvitation("?invite=one&invite=two&workspace=w", "w"), {
    token: "one",
    workspaceId: "w",
  });
  assert.equal(readTeamspaceInvitation("?invite=one&workspace=other", "w"), null);
  assert.equal(readTeamspaceInvitation("?invite=&workspace=w", "w"), null);
});
