import assert from "node:assert/strict";
import { test } from "node:test";
import { createTaskDatabase } from "./commands.ts";

test("task source linking does not create a database and preserves selection limits", async () => {
  const changes = [];
  const input = {
    workspaceId: "workspace",
    selectedDatabaseIds: ["existing"],
    selection: { sourceView: { parentDatabaseId: "existing" } },
    createDatabase: {
      mutateAsync: async () => {
        throw new Error("unexpected create");
      },
    },
    applyTemplate: {
      mutateAsync: async () => {
        throw new Error("unexpected template");
      },
    },
    saveTaskDatabaseIds: async (ids) => {
      changes.push(ids);
    },
  };
  assert.equal(await createTaskDatabase(input), "already-connected");
  assert.deepEqual(changes, []);
  assert.equal(
    await createTaskDatabase({ ...input, selection: { sourceView: { parentDatabaseId: "new" } } }),
    "linked",
  );
  assert.deepEqual(changes, [["existing", "new"]]);
});

test("task source creation materializes required schema before connecting it", async () => {
  const calls = [];
  const result = await createTaskDatabase({
    workspaceId: "workspace",
    selectedDatabaseIds: [],
    selection: { databaseName: "Tasks" },
    createDatabase: {
      mutateAsync: async (input) => {
        calls.push(["create", input]);
        return { database: { id: "host", config: {} }, activeDataSource: { id: "source" } };
      },
    },
    applyTemplate: {
      mutateAsync: async (input) => {
        calls.push(["template", input]);
      },
    },
    saveTaskDatabaseIds: async (ids) => {
      calls.push(["connect", ids]);
    },
  });
  assert.equal(result, "created");
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["create", "template", "connect"],
  );
  assert.deepEqual(
    calls[1][1].properties.map(({ name, type }) => [name, type]),
    [
      ["Status", "status"],
      ["Assignee", "person"],
      ["Due date", "date"],
    ],
  );
  assert.equal(calls[1][1].databaseId, "source");
  assert.deepEqual(calls[2][1], ["host"]);
});
