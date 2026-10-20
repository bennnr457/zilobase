import assert from "node:assert/strict";
import test from "node:test";
import { createMutationTestRuntime } from "../../shared/mutation-runtime.test";
import { sharedClient } from "../../data/client";
import { cacheTestBootstrap } from "../../data/testing";
import { databaseController } from "../interactions/store";
import { databaseBootstrapQueryKey } from "../queries/keys";
import { resolveDatabaseBootstrap } from "../cache-references";
import { observeDatabaseViewCreation } from "../records/mutation-bindings";
import { useAddDatabaseView, useCreateDatabase } from "../react";
import type { DatabaseCommandRequest, DatabaseViewEntity } from "../core/entities";
import { createTestDatabasePayload, setTestDatabaseClientState } from "./test-helpers";

const flush = async () => {
  for (let index = 0; index < 10; index++)
    await new Promise<void>((resolve) => setImmediate(resolve));
};
function gate() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function ack(
  request: DatabaseCommandRequest,
  databaseId: string,
  changes: object,
  result: unknown,
  version = 1,
) {
  return {
    commandId: request.commandId,
    sourceVersions: {},
    result,
    event: {
      actorId: "test-account",
      areas: ["views"],
      changes,
      commandId: request.commandId,
      committedAt: "2026-10-20T00:00:00.000Z",
      databaseId,
      dataSourceId: null,
      eventId: request.commandId,
      protocolVersion: 2,
      type: "database.mutation",
      version,
    },
  };
}

test("new view previews before delivery, preserves its ID, and confirms without duplicates", async () => {
  const delivery = gate();
  let preview: DatabaseViewEntity | undefined;
  let request!: DatabaseCommandRequest;
  const { mutation, queryClient } = createMutationTestRuntime(
    useAddDatabaseView,
    async <T>(_path: string, init?: RequestInit) => {
      request = JSON.parse(String(init?.body));
      await delivery.promise;
      assert.equal(request.command.type, "view.create");
      const saved = { ...preview!, name: "Saved board" };
      return ack(request, "database-1", { views: [saved] }, saved) as T;
    },
  );
  setTestDatabaseClientState(queryClient, createTestDatabasePayload());
  const store = databaseController(queryClient, "test-session", async () => {
    throw Error("unused");
  });
  try {
    let settled = false;
    const saving = mutation
      .mutateAsync({
        databaseId: "database-1",
        dataSourceId: "data-source-1",
        name: "Board",
        type: "kanban",
        onOptimistic: (view) => {
          preview = view;
        },
      })
      .then((result) => {
        settled = true;
        return result;
      });
    await flush();
    assert.ok(preview);
    assert.equal(settled, false);
    assert.equal(request.command.type === "view.create" && request.command.viewId, preview.id);
    assert.equal(
      store.bootstrap("database-1")?.views.filter((view) => view.id === preview!.id).length,
      1,
    );
    assert.equal(
      sharedClient(queryClient)
        .database("database-1")!
        .databases.views.collection.base.has(preview.id),
      false,
    );
    delivery.resolve();
    assert.equal((await saving).id, preview.id);
    assert.equal(
      store.bootstrap("database-1")?.views.filter((view) => view.id === preview!.id).length,
      1,
    );
    assert.equal(
      store.bootstrap("database-1")?.views.find((view) => view.id === preview!.id)?.name,
      "Saved board",
    );
  } finally {
    queryClient.clear();
  }
});

test("rejected view creation removes only its preview and cancels dependent edits", async () => {
  const delivery = gate();
  let requests = 0;
  let preview!: DatabaseViewEntity;
  const { mutation, queryClient } = createMutationTestRuntime(
    useAddDatabaseView,
    async <T>(): Promise<T> => {
      requests++;
      await delivery.promise;
      throw Object.assign(Error("Forbidden"), { status: 403 });
    },
  );
  setTestDatabaseClientState(queryClient, createTestDatabasePayload());
  const store = databaseController(queryClient, "test-session", async () => {
    throw Error("unused");
  });
  try {
    const before = store.bootstrap("database-1")!;
    const saving = mutation.mutateAsync({
      databaseId: "database-1",
      dataSourceId: "data-source-1",
      name: "List",
      type: "list",
      onOptimistic: (view) => {
        preview = view;
      },
    });
    const rejection = assert.rejects(saving, /Forbidden/);
    await flush();
    const edit = store.execute({
      databaseId: "database-1",
      command: { type: "view.update", viewId: preview.id, patch: { name: "Renamed" } },
    });
    const editRejection = assert.rejects(edit, /Forbidden/);
    delivery.resolve();
    await Promise.all([rejection, editRejection]);
    assert.equal(requests, 1);
    assert.deepEqual(store.bootstrap("database-1")?.views, before.views);
  } finally {
    queryClient.clear();
  }
});

test("database creation exposes setup immediately, orders dependent setup, and retains preview until a confirmed read", async () => {
  const delivery = gate();
  const sent: DatabaseCommandRequest[] = [];
  let databaseId = "";
  const { mutation, queryClient } = createMutationTestRuntime(
    useCreateDatabase,
    async <T>(_path: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as DatabaseCommandRequest;
      sent.push(request);
      await delivery.promise;
      return ack(request, databaseId, {}, {}) as T;
    },
  );
  const store = databaseController(queryClient, "test-session", async () => {
    throw Error("unused");
  });
  try {
    const saving = mutation.mutateAsync({
      workspaceId: "org-1",
      pageId: "page-root",
      onOptimistic: (database) => {
        databaseId = database.id;
      },
    });
    await flush();
    assert.ok(databaseId);
    const preview = store.bootstrap(databaseId)!;
    assert.equal(preview.database.pageId, "page-root");
    assert.deepEqual(preview.dataSources, []);
    assert.equal(sharedClient(queryClient).database(databaseId), undefined);
    const setup = store.execute({
      databaseId,
      command: {
        type: "dataSource.create",
        name: "Tasks",
        config: {},
        viewName: "Table",
        viewType: "table",
      },
    });
    assert.equal(sent.length, 1);
    delivery.resolve();
    await Promise.all([saving, setup]);
    assert.equal(sent.length, 2);
    assert.ok(store.creation(databaseId));
    const key = databaseBootstrapQueryKey("test-session", { databaseId });
    cacheTestBootstrap(queryClient, key, {
      ...preview,
      database: { ...preview.database, version: 1 },
    });
    assert.equal(store.creation(databaseId), undefined);
    assert.equal(
      resolveDatabaseBootstrap(queryClient, queryClient.getQueryData(key))?.database.id,
      databaseId,
    );
  } finally {
    queryClient.clear();
  }
});

test("database rejection removes setup preview and rejects queued setup without sending it", async () => {
  const delivery = gate();
  let databaseId = "",
    requests = 0;
  const { mutation, queryClient } = createMutationTestRuntime(
    useCreateDatabase,
    async <T>(): Promise<T> => {
      requests++;
      await delivery.promise;
      throw Object.assign(Error("Forbidden"), { status: 403 });
    },
  );
  const store = databaseController(queryClient, "test-session", async () => {
    throw Error("unused");
  });
  try {
    const saving = mutation.mutateAsync({
      workspaceId: "org-1",
      pageId: "page-root",
      onOptimistic: (database) => {
        databaseId = database.id;
      },
    });
    const rejected = assert.rejects(saving, /Forbidden/);
    await flush();
    const setup = store.execute({
      databaseId,
      command: {
        type: "dataSource.create",
        name: "Tasks",
        config: {},
        viewName: "Table",
        viewType: "table",
      },
    });
    const setupRejected = assert.rejects(setup, /Forbidden/);
    delivery.resolve();
    await Promise.all([rejected, setupRejected]);
    assert.equal(requests, 1);
    assert.equal(store.bootstrap(databaseId), undefined);
    assert.equal(store.creationFailed(databaseId), true);
  } finally {
    queryClient.clear();
  }
});

test("view admission selects once, so acknowledgement cannot steal a later selection", async () => {
  const delivery = gate();
  const selected: string[] = [];
  const preview = { id: "new-view" } as DatabaseViewEntity;
  observeDatabaseViewCreation(
    async (input) => {
      input.onOptimistic?.(preview);
      await delivery.promise;
      return preview;
    },
    { databaseId: "host", dataSourceId: "source" },
    { onSuccess: (view) => selected.push(view.id) },
  );
  assert.deepEqual(selected, ["new-view"]);
  selected.push("another-view");
  delivery.resolve();
  await flush();
  assert.deepEqual(selected, ["new-view", "another-view"]);
});

test("a late creation acknowledgement cannot restore an expired identity's preview", async () => {
  const delivery = gate();
  let databaseId = "";
  const { mutation, queryClient } = createMutationTestRuntime(
    useCreateDatabase,
    async <T>(_path: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as DatabaseCommandRequest;
      await delivery.promise;
      return ack(request, databaseId, {}, {}) as T;
    },
  );
  const store = databaseController(queryClient, "test-session", async () => {
    throw Error("unused");
  });
  try {
    const saving = mutation.mutateAsync({
      workspaceId: "org-1",
      pageId: "page-root",
      onOptimistic: (database) => {
        databaseId = database.id;
      },
    });
    const rejected = assert.rejects(saving, /expired identity/);
    await flush();
    assert.ok(store.creation(databaseId));
    sharedClient(queryClient).clear();
    delivery.resolve();
    await rejected;
    assert.equal(store.creation(databaseId), undefined);
    assert.equal(sharedClient(queryClient).database(databaseId), undefined);
  } finally {
    queryClient.clear();
  }
});

test("a view can preview while its required property saves, then sends confirmed property IDs", async () => {
  const delivery = gate();
  const sent: DatabaseCommandRequest[] = [];
  const { useAddDatabaseProperty } = await import("../react");
  const { mutation, queryClient } = createMutationTestRuntime(
    () => ({ property: useAddDatabaseProperty(), view: useAddDatabaseView() }),
    async <T>(_path: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as DatabaseCommandRequest;
      sent.push(request);
      if (request.command.type === "property.create") {
        await delivery.promise;
        const property = {
          ...createTestDatabasePayload().properties[0],
          id: "saved-column",
          propertyId: "saved-field",
          property: {
            ...createTestDatabasePayload().properties[0].property,
            id: "saved-field",
            config: {},
          },
          width: null,
        };
        return {
          ...ack(
            request,
            "database-1",
            { properties: [property], sourceVersions: { "data-source-1": 1 } },
            property,
          ),
          sourceVersions: { "data-source-1": 1 },
          event: {
            ...ack(
              request,
              "database-1",
              { properties: [property], sourceVersions: { "data-source-1": 1 } },
              property,
            ).event,
            areas: ["properties"],
            dataSourceId: "data-source-1",
          },
        } as T;
      }
      assert.equal(request.command.type, "view.create");
      const view = { ...preview!, config: request.command.config };
      return ack(request, "database-1", { views: [view] }, view, 2) as T;
    },
  );
  setTestDatabaseClientState(queryClient, createTestDatabasePayload());
  const store = databaseController(queryClient, "test-session", async () => {
    throw Error("unused");
  });
  let preview: DatabaseViewEntity | undefined;
  let viewSaving!: Promise<DatabaseViewEntity>;
  try {
    const propertySaving = mutation.property.mutateAsync({
      databaseId: "data-source-1",
      name: "Status",
      type: "status",
      onOptimistic: (property) => {
        viewSaving = mutation.view.mutateAsync({
          databaseId: "database-1",
          dataSourceId: "data-source-1",
          name: "Kanban",
          type: "kanban",
          config: { groupPropertyId: property.property.id, hiddenPropertyIds: [property.id] },
          onOptimistic: (view) => {
            preview = view;
          },
        });
      },
    });
    await flush();
    assert.ok(preview);
    assert.equal(sent.length, 1);
    assert.ok(store.bootstrap("database-1")?.views.some((view) => view.id === preview!.id));
    delivery.resolve();
    await propertySaving;
    await viewSaving;
    assert.equal(sent.length, 2);
    assert.deepEqual(sent[1]?.command.type === "view.create" && sent[1].command.config, {
      groupPropertyId: "saved-field",
      hiddenPropertyIds: ["saved-column"],
    });
  } finally {
    queryClient.clear();
  }
});
