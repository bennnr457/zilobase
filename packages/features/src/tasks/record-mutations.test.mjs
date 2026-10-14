import assert from "node:assert/strict";
import test from "node:test";
import {
  getTaskPropertyUpdate,
  getTaskCreationInput,
  getTaskCompletionUpdate,
} from "./commands.ts";
import { STATUS_PROPERTY_ID, ASSIGNEE_PROPERTY_ID } from "./view-data.ts";
const payload = {
  database: { id: "host" },
  activeDataSource: { id: "source" },
  properties: [
    {
      id: "status-binding",
      property: {
        id: "status",
        name: "Status",
        type: "status",
        config: {
          options: [
            { id: "todo", name: "Todo", group: "To-do" },
            { id: "done", name: "Done", group: "Complete" },
          ],
        },
      },
    },
    {
      id: "person-binding",
      property: { id: "person", name: "Assignee", type: "person", config: {} },
    },
  ],
};
const task = { databaseId: "host", rowId: "row" };
test("task writes target source properties and preserve empty-value serialization", () => {
  assert.deepEqual(getTaskPropertyUpdate(task, payload, ASSIGNEE_PROPERTY_ID, ["user"]), {
    databaseId: "source",
    hostDatabaseId: "host",
    propertyId: "person",
    rowId: "row",
    value: ["user"],
  });
  assert.equal(getTaskPropertyUpdate(task, payload, STATUS_PROPERTY_ID, "").value, null);
  assert.equal(getTaskPropertyUpdate(task, payload, "unknown", "value"), null);
  assert.equal(getTaskPropertyUpdate(undefined, payload, STATUS_PROPERTY_ID, "Done"), null);
  assert.deepEqual(getTaskCompletionUpdate(task, payload, true), {
    databaseId: "source",
    hostDatabaseId: "host",
    propertyId: "status",
    rowId: "row",
    value: "Done",
  });
  assert.equal(getTaskCompletionUpdate(task, { ...payload, properties: [] }, true), null);
});
test("task creation selects the first source with current-user assignment and incomplete status", () => {
  assert.deepEqual(getTaskCreationInput(payload, "user"), {
    databaseId: "source",
    hostDatabaseId: "host",
    initialValues: [
      { propertyId: "person", value: ["user"] },
      { propertyId: "status", value: "Todo" },
    ],
  });
  assert.deepEqual(getTaskCreationInput(payload, null).initialValues, [
    { propertyId: "status", value: "Todo" },
  ]);
  assert.equal(getTaskCreationInput({ ...payload, properties: [] }, "user"), null);
});
