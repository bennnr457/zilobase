import assert from "node:assert/strict";
import test from "node:test";
import { TestQueryClient } from "../data/testing";
import { sharedClient } from "../data/client";
import {
  createTestDatabasePayload,
  setTestDatabaseClientState,
} from "../databases/mutations/test-helpers";
import type { ApiFetcher } from "../shared/api-fetcher";
import { changePagePropertyValue } from "./operations";

function fixture() {
  const client = new TestQueryClient();
  const payload = createTestDatabasePayload();
  setTestDatabaseClientState(client, payload);
  const properties = {
    workspaceId: "org-1",
    properties: payload.properties.map((binding) => binding.property),
    values: payload.values,
    presenceTargets: [
      {
        databaseId: "database-1",
        dataSourceId: "data-source-1",
        rowId: "row-1",
        propertyIds: ["property-status", "property-name"],
      },
    ],
  };
  return { client, properties };
}

test("unsent property edits share authorization refresh and submit only the latest value", async () => {
  const { client, properties } = fixture();
  let release!: (value: unknown) => void;
  const writes: Array<Record<string, unknown>> = [];
  let reads = 0;
  const apiFetch = (async (_path: string, init?: RequestInit) => {
    if (init?.method !== "POST") {
      reads++;
      return new Promise<unknown>((resolve) => {
        release = resolve;
      });
    }
    const request = JSON.parse(String(init.body));
    writes.push(request.command);
    return {
      commandId: request.commandId,
      result: {},
      sourceVersions: { "data-source-1": 1 },
      event: {
        actorId: "actor",
        areas: ["records"],
        changes: {},
        commandId: request.commandId,
        committedAt: new Date().toISOString(),
        databaseId: "database-1",
        dataSourceId: "data-source-1",
        eventId: request.commandId,
        protocolVersion: 2,
        type: "database.mutation",
        version: 1,
        requiresReset: true,
      },
    };
  }) as ApiFetcher;
  const context = { queryClient: client, apiFetch };
  const input = {
    pageId: "page-1",
    propertyId: "property-status",
    databaseId: "database-1",
    value: "In progress",
  };
  try {
    const first = changePagePropertyValue(context, input);
    const latest = changePagePropertyValue(context, { ...input, value: "Done" });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(reads, 1);
    assert.equal(writes.length, 0);
    release(properties);
    await Promise.all([first, latest]);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0]?.valuesByPropertyId, { "property-status": "Done" });
  } finally {
    client.clear();
  }
});

test("an expired identity or denied authorization cannot deliver a retained property edit", async () => {
  for (const expired of [true, false]) {
    const { client, properties } = fixture();
    let release!: (value: unknown) => void;
    let reject!: (error: unknown) => void;
    let writes = 0;
    const apiFetch = (async (_path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        writes++;
        throw new Error("unexpected write");
      }
      return new Promise<unknown>((accept, fail) => {
        release = accept;
        reject = fail;
      });
    }) as ApiFetcher;
    try {
      const result = changePagePropertyValue(
        { queryClient: client, apiFetch },
        { pageId: "page-1", propertyId: "property-status", value: "Done" },
      );
      const rejected = assert.rejects(result);
      for (let i = 0; i < 10; i++) await Promise.resolve();
      if (expired) {
        sharedClient(client).clear();
        release(properties);
      } else reject(Object.assign(new Error("forbidden"), { status: 403 }));
      await rejected;
      assert.equal(writes, 0);
    } finally {
      client.clear();
    }
  }
});

test("removed or ambiguous property targets fail explicitly without a write", async () => {
  for (const ambiguous of [false, true]) {
    const { client, properties } = fixture();
    let writes = 0;
    const apiFetch = (async (_path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        writes++;
        throw new Error("unexpected write");
      }
      return {
        ...properties,
        presenceTargets: ambiguous
          ? [
              properties.presenceTargets[0],
              { ...properties.presenceTargets[0], rowId: "other-row" },
            ]
          : [],
      };
    }) as ApiFetcher;
    try {
      await assert.rejects(
        changePagePropertyValue(
          { queryClient: client, apiFetch },
          { pageId: "page-1", propertyId: "property-status", value: "Done" },
        ),
        /no longer editable/,
      );
      assert.equal(writes, 0);
    } finally {
      client.clear();
    }
  }
});
