import assert from "node:assert/strict";
import { test } from "node:test";
import { createZilobaseClient } from "../shared/client.ts";
import { createTaskDatabase, TaskDatabaseSetupError } from "./commands.ts";

function runtime(calls, failTemplate = false) {
  const apiFetch = async (_path, init) => {
    const { commandId, command } = JSON.parse(init.body);
    calls.push([command.type, command]);
    if (failTemplate && command.type === "template.apply")
      throw Object.assign(new Error("Template rejected"), { status: 400 });
    const databaseId = command.type === "database.create" ? commandId : _path.split("/")[2];
    return {
      commandId,
      sourceVersions: command.type === "database.create" ? {} : { source: 1 },
      result:
        command.type === "database.create"
          ? { database: { id: databaseId, config: {} }, activeDataSource: { id: "source" } }
          : { dataSource: { id: "source" } },
      event: {
        actorId: "actor",
        areas: ["databases"],
        changes: {},
        commandId,
        committedAt: "2026-10-19T00:00:00Z",
        databaseId,
        dataSourceId: command.type === "database.create" ? null : "source",
        eventId: commandId,
        protocolVersion: 2,
        type: "database.mutation",
        version: 1,
      },
    };
  };
  const client = createZilobaseClient({ deployment: "test", apiFetch });
  return { ...client, context: { apiFetch, queryClient: client.queryClient } };
}

test("task source linking does not create a database and preserves selection limits", async () => {
  const changes = [],
    calls = [],
    client = runtime(calls);
  const input = {
    workspaceId: "workspace",
    selectedDatabaseIds: ["existing"],
    selection: { sourceView: { parentDatabaseId: "existing" } },
    saveTaskDatabaseIds: async (ids) => changes.push(ids),
  };
  try {
    assert.equal((await createTaskDatabase(client.context, input)).status, "already-connected");
    assert.deepEqual(changes, []);
    assert.equal(
      (
        await createTaskDatabase(client.context, {
          ...input,
          selection: { sourceView: { parentDatabaseId: "new" } },
        })
      ).status,
      "linked",
    );
    assert.deepEqual(changes, [["existing", "new"]]);
    assert.deepEqual(calls, []);
  } finally {
    client.dispose();
  }
});

test("task creation composes exported operations before connecting; partial failure retains IDs", async () => {
  for (const fail of [false, true]) {
    const calls = [],
      client = runtime(calls, fail);
    try {
      const pending = createTaskDatabase(client.context, {
        workspaceId: "workspace",
        selectedDatabaseIds: [],
        selection: { databaseName: "Tasks" },
        saveTaskDatabaseIds: async (ids) => calls.push(["connect", ids]),
      });
      if (fail) {
        await assert.rejects(
          pending,
          (error) =>
            error instanceof TaskDatabaseSetupError &&
            Boolean(error.created.database.id) &&
            error.created.activeDataSource.id === "source",
        );
        assert.deepEqual(
          calls.map(([kind]) => kind),
          ["database.create", "template.apply"],
        );
      } else {
        const result = await pending;
        assert.equal(result.status, "created");
        assert.deepEqual(
          calls.map(([kind]) => kind),
          ["database.create", "template.apply", "connect"],
        );
        assert.deepEqual(
          calls[1][1].properties.map(({ name, type }) => [name, type]),
          [
            ["Status", "status"],
            ["Assignee", "person"],
            ["Due date", "date"],
          ],
        );
        assert.deepEqual(calls[2][1], [result.databaseId]);
      }
    } finally {
      client.dispose();
    }
  }
});
