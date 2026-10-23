import assert from "node:assert/strict";
import test from "node:test";
import { QueryObserver } from "@tanstack/react-query";
import { TestQueryClient } from "../../data/testing";
import { sharedClient } from "../../data/client";
import type { ApiFetcher } from "../../shared/api-fetcher";
import { createTestDatabasePayload, setTestDatabaseClientState } from "../mutations/test-helpers";
import { DatabaseController } from "../interactions/store";
import { submitRecordChange } from "../interactions/record-change";
import { prefetchDatabaseWindow } from "./records";
import { DatabaseRealtimeManager } from "../realtime/realtime";

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("request budget: five idle heartbeats, one content POST, duplicate delivery and a genuine gap", async () => {
  const client = new TestQueryClient();
  setTestDatabaseClientState(client, createTestDatabasePayload());
  const owner = sharedClient(client).database("database-1", "test-session")!;
  const counts = { bootstrap: 0, records: 0, commands: 0 };
  const observers = client
    .getQueryCache()
    .findAll({ queryKey: ["db", "test-session", "database-1"] })
    .map((query) => {
      const observer = new QueryObserver(client, {
        queryKey: query.queryKey,
        staleTime: Infinity,
        queryFn: async () => {
          if (query.queryKey[3] === "bootstrap") counts.bootstrap++;
          else counts.records++;
          return query.state.data;
        },
      });
      return observer.subscribe(() => {});
    });
  const record = owner.databases.resolveRecord("row-1")!;
  const stamp = new Date().toISOString();
  const updated = {
    ...record,
    updatedAt: stamp,
    valuesByPropertyId: {
      ...record.valuesByPropertyId,
      "property-status": {
        ...record.valuesByPropertyId["property-status"]!,
        value: "Done",
        updatedAt: stamp,
      },
    },
  };
  let delivered: unknown;
  const apiFetch = (async (_path: string, init?: RequestInit) => {
    assert.equal(init?.method, "POST", "No API GET is needed for this edit");
    counts.commands++;
    const { commandId, command } = JSON.parse(String(init.body));
    assert.equal(command.type, "row.change");
    const event = {
      actorId: "actor",
      areas: ["records"],
      changes: { records: [updated], sourceVersions: { "data-source-1": 1 } },
      commandId,
      committedAt: stamp,
      databaseId: "database-1",
      dataSourceId: "data-source-1",
      eventId: commandId,
      protocolVersion: 2,
      type: "database.mutation",
      version: 1,
    };
    delivered = event;
    return { commandId, result: updated, sourceVersions: { "data-source-1": 1 }, event };
  }) as ApiFetcher;
  const manager = new DatabaseRealtimeManager(
    client,
    apiFetch,
    "database-1",
    "test-session",
    () => {},
  );
  const controller = new DatabaseController(client, "test-session", apiFetch);
  try {
    for (let cycle = 0; cycle < 5; cycle++)
      manager["handleMessage"]('{"type":"realtime.pong"}', {} as WebSocket);
    await settle();
    assert.deepEqual(counts, { bootstrap: 0, records: 0, commands: 0 });
    const window = client
      .getQueryCache()
      .findAll({ queryKey: ["db", "test-session", "database-1", "window"] })[0]!;
    await Promise.all(
      ["table", "kanban", "gallery"].map((viewId) =>
        prefetchDatabaseWindow(
          client,
          apiFetch,
          "test-session",
          {
            databaseId: "database-1",
            dataSourceId: "data-source-1",
            queryHash: String(window.queryKey[5]),
            viewId,
          },
          50,
        ),
      ),
    );
    assert.deepEqual(counts, { bootstrap: 0, records: 0, commands: 0 });
    await submitRecordChange(controller, {
      databaseId: "database-1",
      dataSourceId: "data-source-1",
      rowId: "row-1",
      valuesByPropertyId: { "property-status": "Done" },
    });
    await settle();
    assert.deepEqual(counts, { bootstrap: 0, records: 0, commands: 1 });
    for (let duplicate = 0; duplicate < 3; duplicate++)
      manager["handleMessage"](JSON.stringify(delivered), {} as WebSocket);
    await settle();
    assert.deepEqual(counts, { bootstrap: 0, records: 0, commands: 1 });
    manager["handleMessage"](
      JSON.stringify({ ...(delivered as object), version: 4, eventId: "gap", commandId: "gap" }),
      {} as WebSocket,
    );
    await settle();
    assert.deepEqual(counts, { bootstrap: 1, records: 1, commands: 1 });
  } finally {
    for (const unsubscribe of observers) unsubscribe();
    controller.dispose();
    client.clear();
  }
});
