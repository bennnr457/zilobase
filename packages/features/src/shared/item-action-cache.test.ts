import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { TestQueryClient } from "../data/testing";
import { sharedClient } from "../data/client";

import { databaseBootstrapQueryKey, databaseWindowQueryKey } from "../databases/queries/keys";
import { invalidateDeletedItems, invalidateRestoredItems } from "./item-action-cache";

test("deleting a database refreshes trash-aware reads and evicts active-only reads", async () => {
  const queryClient = new QueryClient();
  const activeBootstrap = databaseBootstrapQueryKey("session-1", {
    databaseId: "database-1",
  });
  const deletedBootstrap = databaseBootstrapQueryKey("session-1", {
    databaseId: "database-1",
    includeDeleted: true,
  });

  try {
    queryClient.setQueryData(activeBootstrap, { cached: true });
    queryClient.setQueryData(deletedBootstrap, { cached: true });

    await invalidateDeletedItems({
      queryClient,
      result: {
        deletedDatabaseIds: ["database-1"],
        deletedPageIds: [],
      },
      workspaceId: "workspace-1",
    });

    assert.equal(queryClient.getQueryState(activeBootstrap), undefined);
    assert.equal(queryClient.getQueryState(deletedBootstrap)?.isInvalidated, true);
  } finally {
    queryClient.clear();
  }
});

test("restoring a database invalidates active and trash-aware database reads", async () => {
  const queryClient = new QueryClient();
  const activeBootstrap = databaseBootstrapQueryKey("session-1", {
    databaseId: "database-1",
  });
  const deletedBootstrap = databaseBootstrapQueryKey("session-1", {
    databaseId: "database-1",
    includeDeleted: true,
  });
  const deletedWindow = databaseWindowQueryKey("session-1", {
    databaseId: "database-1",
    dataSourceId: "source-1",
    includeDeleted: true,
    queryHash: "query-1",
  });
  const otherBootstrap = databaseBootstrapQueryKey("session-1", {
    databaseId: "database-2",
  });

  try {
    for (const key of [activeBootstrap, deletedBootstrap, deletedWindow, otherBootstrap]) {
      queryClient.setQueryData(key, { cached: true });
    }

    await invalidateRestoredItems({
      queryClient,
      result: {
        restoredDatabaseIds: ["database-1"],
        restoredPageIds: [],
      },
      workspaceId: "workspace-1",
    });

    assert.equal(queryClient.getQueryState(activeBootstrap)?.isInvalidated, true);
    assert.equal(queryClient.getQueryState(deletedBootstrap)?.isInvalidated, true);
    assert.equal(queryClient.getQueryState(deletedWindow)?.isInvalidated, true);
    assert.equal(queryClient.getQueryState(otherBootstrap)?.isInvalidated, false);
  } finally {
    queryClient.clear();
  }
});

for (const action of ["trash", "restore"] as const) {
  test(`${action} of an individual row page refreshes only its source memberships`, async () => {
    const queryClient = new TestQueryClient();
    try {
      const client = sharedClient(queryClient);
      const owner = client.resolve(client.capture(), "workspace-1");
      owner.databases.admitPageProperties("row-page", [
        {
          databaseId: "database-1",
          dataSourceId: "source-1",
          rowId: "row-1",
          propertyIds: [],
        },
      ]);
      const key = (sourceId: string) =>
        databaseWindowQueryKey("session-1", {
          databaseId: "database-1",
          dataSourceId: sourceId,
          queryHash: "query-1",
        });
      queryClient.setQueryData(key("source-1"), { cached: true });
      queryClient.setQueryData(key("source-2"), { cached: true });
      if (action === "trash")
        await invalidateDeletedItems({
          workspaceId: "workspace-1",
          queryClient,
          result: { deletedDatabaseIds: [], deletedPageIds: ["row-page"] },
        });
      else
        await invalidateRestoredItems({
          workspaceId: "workspace-1",
          queryClient,
          result: { restoredDatabaseIds: [], restoredPageIds: ["row-page"] },
        });
      assert.equal(queryClient.getQueryState(key("source-1"))?.isInvalidated, true);
      assert.equal(queryClient.getQueryState(key("source-2"))?.isInvalidated, false);
    } finally {
      queryClient.clear();
    }
  });
}

test("expired lifecycle responses cannot invalidate the next account's reads", async () => {
  const queryClient = new QueryClient();
  const key = databaseBootstrapQueryKey("next-account", { databaseId: "database-1" });
  try {
    queryClient.setQueryData(key, { cached: true });
    await invalidateDeletedItems({
      workspaceId: "workspace-1",
      queryClient,
      isCurrent: () => false,
      result: { deletedDatabaseIds: ["database-1"], deletedPageIds: ["page"] },
    });
    await invalidateRestoredItems({
      workspaceId: "workspace-1",
      queryClient,
      isCurrent: () => false,
      result: { restoredDatabaseIds: ["database-1"], restoredPageIds: ["page"] },
    });
    assert.equal(queryClient.getQueryState(key)?.isInvalidated, false);
  } finally {
    queryClient.clear();
  }
});

test("restoration after membership eviction refreshes active windows in the restored workspace", async () => {
  const queryClient = new TestQueryClient();
  try {
    const client = sharedClient(queryClient);
    const owner = client.resolve(client.capture(), "workspace-1");
    owner.databases.admitPageProperties("another-row-page", [
      {
        databaseId: "database-1",
        dataSourceId: "source-1",
        rowId: "another-row",
        propertyIds: [],
      },
    ]);
    const key = databaseWindowQueryKey("session-1", {
      databaseId: "database-1",
      dataSourceId: "source-1",
      queryHash: "query-1",
    });
    queryClient.setQueryData(key, { cached: true });
    await invalidateRestoredItems({
      workspaceId: "workspace-1",
      queryClient,
      result: { restoredDatabaseIds: [], restoredPageIds: ["evicted-page"] },
    });
    assert.equal(queryClient.getQueryState(key)?.isInvalidated, true);
  } finally {
    queryClient.clear();
  }
});
