import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  hydratePageReadSnapshots,
  subscribePageReadSnapshots,
  resolveEmbeddedItemsOpenAsFromCache,
  type PageReadSnapshot,
} from "./read-cache";
import { TestQueryClient } from "../data/testing";
import { cachePageDetail } from "./cache";
import { defaultUserSettings, userSettingsQueryKey } from "../user-settings/queries";
import type { Page } from "./contracts";

test("embedded preferences read client storage only for published pages and prefer cached page identity", () => {
  const client = new TestQueryClient();
  const page: Page = {
    id: "page",
    workspaceId: "workspace",
    name: "Page",
    type: "pageblock",
    url: "#",
    createdAt: "2026-10-12T00:00:00Z",
    updatedAt: "2026-10-12T00:00:00Z",
  };
  const published = { ...page, publishedOwnerPreferences: { pageFullWidth: true } };
  let reads = 0;
  const readPublished = () => {
    reads++;
    return "dialog" as const;
  };
  try {
    assert.equal(
      resolveEmbeddedItemsOpenAsFromCache(client, page.id, page, readPublished),
      "sidepanel",
    );
    client.setQueryData(userSettingsQueryKey, {
      ...defaultUserSettings,
      embeddedItemsOpenAs: "dialog",
    });
    assert.equal(
      resolveEmbeddedItemsOpenAsFromCache(client, page.id, page, readPublished),
      "dialog",
    );
    assert.equal(reads, 0);
    assert.equal(
      resolveEmbeddedItemsOpenAsFromCache(client, page.id, published, readPublished),
      "dialog",
    );
    assert.equal(reads, 1);
    cachePageDetail(client, { page, accessLevel: "full", databaseIds: [] });
    resolveEmbeddedItemsOpenAsFromCache(client, page.id, published, readPublished);
    assert.equal(reads, 1, "cached authenticated detail takes precedence over fallback");
  } finally {
    client.clear();
  }
});

test("snapshot hydration preserves newer data and refuses session-owned entity reads", () => {
  const client = new QueryClient();
  const key = ["meetings", "list", "workspace"];
  const newer = { meetings: [{ id: "new" }] };
  client.setQueryData(key, newer, { updatedAt: 200 });
  hydratePageReadSnapshots(client, "session", [
    { queryKey: key, data: { meetings: [] }, updatedAt: 100 },
    { queryKey: ["page", "p", "properties"], data: { properties: [], values: [] }, updatedAt: 300 },
    { queryKey: ["user-settings"], data: { id: "settings" }, updatedAt: 150 },
  ]);
  assert.equal(client.getQueryData(key), newer);
  assert.equal(client.getQueryData(["page", "p", "properties"]), undefined);
  assert.equal(client.getQueryState(["user-settings"])?.dataUpdatedAt, 150);
  assert.equal(client.getQueryState(["user-settings"])?.isInvalidated, true);
  client.clear();
});

test("snapshot observation persists server reads, evicts access denials, and unsubscribes", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const saved: (PageReadSnapshot & { scope: string })[] = [];
  const denied: string[] = [];
  const stop = subscribePageReadSnapshots(
    client,
    "session",
    (snapshot) => saved.push(snapshot),
    (scope) => denied.push(scope),
  );
  client.setQueryData(["user-settings"], { source: "manual" });
  assert.equal(saved.length, 0);
  await client.fetchQuery({
    queryKey: ["user-settings"],
    queryFn: async () => ({ source: "server" }),
    staleTime: 0,
  });
  assert.equal(saved[0]?.scope, "user");
  assert.deepEqual(saved[0]?.data, { source: "server" });
  for (const status of [401, 403, 404, 500]) {
    const key = ["db", "session", `database-${status}`, "bootstrap"];
    await assert.rejects(
      client.fetchQuery({
        queryKey: key,
        queryFn: async () => {
          throw { status };
        },
      }),
    );
    assert.equal(client.getQueryState(key) === undefined, status !== 500);
  }
  await assert.rejects(
    client.fetchQuery({
      queryKey: ["db", "other-session", "other", "bootstrap"],
      queryFn: async () => {
        throw { status: 403 };
      },
    }),
  );
  assert.deepEqual(denied, [
    "database:database-401",
    "database:database-403",
    "database:database-404",
  ]);
  stop();
  await client.fetchQuery({
    queryKey: ["meetings", "list", "workspace"],
    queryFn: async () => ({ meetings: [] }),
  });
  assert.equal(saved.length, 1);
  client.clear();
});
