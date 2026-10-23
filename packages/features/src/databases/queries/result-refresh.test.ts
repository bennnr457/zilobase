import assert from "node:assert/strict";
import { test } from "node:test";
import { TestQueryClient } from "../../data/testing";
import { refreshRecordResults } from "./invalidation";

test("record membership recovery reads only affected source windows in the same cache scope", () => {
  const client = new TestQueryClient();
  const requested: unknown[][] = [];
  client.invalidateQueries = async (filters) => {
    requested.push([...(filters?.queryKey ?? [])]);
  };
  const window = (cacheId: string) => ({
    pages: [
      {
        cacheId,
        dataSourceId: "source",
        recordIds: [],
        databaseVersion: 1,
        dataSourceVersion: 1,
        queryHash: "hash",
        hasMore: false,
        offset: 0,
        snapshot: "snapshot",
        totalCount: 0,
      },
    ],
    pageParams: [null],
  });
  const affected = ["db", "session", "host", "window", "source", "hash", false];
  const unrelated = ["db", "session", "host", "window", "other", "hash", false];
  const capability = ["db", "public", "host", "window", "source", "hash", false];
  client.setQueryData(affected, window("cache"));
  client.setQueryData(unrelated, window("cache"));
  client.setQueryData(capability, window("public-cache"));
  client.setQueryData(["db", "session", "host", "bootstrap"], { cacheId: "cache" });
  try {
    refreshRecordResults(client, "cache", { source: 2 });
    assert.deepEqual(requested, [affected]);
  } finally {
    client.clear();
  }
});

test("recovery shares duplicate targets and follows a newer target only when necessary", async () => {
  const { QueryObserver } = await import("@tanstack/react-query");
  const { recoverRecordWindow } = await import("./invalidation");
  const client = new TestQueryClient();
  const key = ["db", "session", "host", "window", "source", "hash", false];
  const ref = (version: number) => ({
    cacheId: "cache",
    dataSourceId: "source",
    recordIds: [],
    databaseVersion: version,
    dataSourceVersion: version,
    queryHash: "hash",
    hasMore: false,
    offset: 0,
    snapshot: "snapshot",
    totalCount: 0,
  });
  client.setQueryData(key, { pages: [ref(1)], pageParams: [null] });
  const responses: Array<(value: unknown) => void> = [];
  const observer = new QueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    queryFn: () => new Promise((resolve) => responses.push(resolve)),
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    const query = client.getQueryCache().find({ queryKey: key })!;
    const first = recoverRecordWindow(client, query, "cache", 2);
    assert.equal(recoverRecordWindow(client, query, "cache", 2), first);
    recoverRecordWindow(client, query, "cache", 3);
    assert.equal(responses.length, 1);
    responses[0]!({ pages: [ref(2)], pageParams: [null] });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(responses.length, 2);
    responses[1]!({ pages: [ref(3)], pageParams: [null] });
    await first;
    await recoverRecordWindow(client, query, "cache", 3);
    assert.equal(responses.length, 2);
    await recoverRecordWindow(client, query, "other-capability", 4);
    assert.equal(responses.length, 2);
  } finally {
    unsubscribe();
    client.clear();
  }
});
