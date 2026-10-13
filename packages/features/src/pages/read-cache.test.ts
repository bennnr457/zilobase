import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  hydratePageReadSnapshots,
  subscribePageReadSnapshots,
  type PageReadSnapshot,
} from "./read-cache";

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
