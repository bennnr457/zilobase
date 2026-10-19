import assert from "node:assert/strict";
import test from "node:test";
import { TestQueryClient } from "../data/testing";
import { sharedClient } from "../data/client";
import {
  createTestDatabasePayload,
  setTestDatabaseClientState,
} from "../databases/mutations/test-helpers";
import { normalizePageProperties, readCachedPagePropertyCoverage } from "./property-cache";

function fixture() {
  const client = new TestQueryClient();
  const payload = createTestDatabasePayload();
  setTestDatabaseClientState(client, payload);
  return { client, payload };
}

test("a loaded row projects properties and values without claiming full page membership", () => {
  const { client } = fixture();
  try {
    const coverage = readCachedPagePropertyCoverage(client, "page-1", "database-1");
    assert.equal(coverage.state, "partial");
    assert.deepEqual(
      coverage.data?.properties.map((p) => p.id),
      ["property-status", "property-name"],
    );
    assert.equal(coverage.data?.values[0]?.value, "Not started");
    assert.deepEqual(coverage.data?.presenceTargets?.[0], {
      databaseId: "database-1",
      dataSourceId: "data-source-1",
      rowId: "row-1",
      propertyIds: ["property-status", "property-name"],
    });
    assert.equal(client.getQueryData(["page", "page-1", "properties"]), undefined);
    assert.equal(
      readCachedPagePropertyCoverage(client, "not-loaded", "database-1").state,
      "missing",
    );
    assert.equal(readCachedPagePropertyCoverage(client, "page-1", "wrong-host").state, "missing");
    assert.equal(
      readCachedPagePropertyCoverage(client, "page-2", "database-1").data?.values.length,
      0,
    );
  } finally {
    client.clear();
  }
});

test("an authoritative properties reference resolves the same canonical values", () => {
  const { client, payload } = fixture();
  try {
    const ref = normalizePageProperties(client, sharedClient(client).capture(), "page-1", {
      workspaceId: "org-1",
      properties: payload.properties.map((p) => p.property),
      values: payload.values,
      databaseIds: ["database-1"],
    });
    client.setQueryData(["page", "page-1", "properties"], ref);
    assert.equal(readCachedPagePropertyCoverage(client, "page-1").state, "complete");
    const owner = sharedClient(client).get(ref.cacheId)!;
    owner.session.ingest([
      owner.databases.definitions.stage([
        {
          ...payload.properties[0]!.property,
          name: "Renamed status",
          updatedAt: "2026-06-02T00:00:00.000Z",
        },
      ]),
    ]);
    assert.equal(
      readCachedPagePropertyCoverage(client, "page-1").data?.properties[0]?.name,
      "Renamed status",
    );
    sharedClient(client).clear();
    assert.equal(readCachedPagePropertyCoverage(client, "page-1", "database-1").state, "missing");
  } finally {
    client.clear();
  }
});

test("denied page reads suppress cached database projections", () => {
  const { client } = fixture();
  try {
    client
      .getQueryCache()
      .build(client, { queryKey: ["page", "page-1"] })
      .setState({
        status: "error",
        error: Object.assign(new Error("denied"), { status: 403 }),
      });
    assert.equal(readCachedPagePropertyCoverage(client, "page-1", "database-1").state, "missing");
  } finally {
    client.clear();
  }
});

import { pageQueryOptions, pagePropertiesQueryOptions } from "./queries";
import { readPageDetailPropertyCoverage } from "./property-cache";
import type { ApiFetcher } from "../shared/api-fetcher";
import type { PagePropertyContext } from "./contracts";

export function contextForFixture(): PagePropertyContext {
  return {
    pageId: "page-1",
    workspaceId: "org-1",
    propertyIds: ["property-status", "property-name"],
    databaseIds: ["database-1"],
    databaseVersions: { "database-1": 0 },
    sourceVersions: { "data-source-1": 0 },
    presenceTargets: [
      {
        databaseId: "database-1",
        dataSourceId: "data-source-1",
        rowId: "row-1",
        propertyIds: ["property-status", "property-name"],
      },
    ],
  };
}

async function authorizeFixture(client: TestQueryClient, context = contextForFixture()) {
  const page = {
    id: "page-1",
    workspaceId: "org-1",
    name: "Alpha",
    type: "pageblock",
    url: "#",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
  await client.fetchQuery(
    pageQueryOptions(
      (async () => ({
        page,
        viewerType: "member",
        databaseIds: context.databaseIds,
        propertyContext: context,
      })) as ApiFetcher,
      page.id,
    ),
  );
}

test("fresh page context reuses complete loaded rows with no properties request", async () => {
  const { client } = fixture();
  try {
    await authorizeFixture(client);
    const coverage = readPageDetailPropertyCoverage(client, "page-1");
    assert.equal(coverage.state, "complete");
    assert.equal(coverage.data?.values[0]?.value, "Not started");
    let requests = 0;
    const result = await client.fetchQuery(
      pagePropertiesQueryOptions(
        (async () => {
          requests++;
          throw new Error("unexpected request");
        }) as ApiFetcher,
        "page-1",
      ),
    );
    assert.equal(requests, 0);
    assert.equal(result.cacheId, coverage.reference?.cacheId);
    assert.equal(result.verifiedAt, coverage.updatedAt);
  } finally {
    client.clear();
  }
});

test("unknown memberships, stale supporting reads and revision mismatches require the endpoint", async () => {
  for (const variant of ["membership", "stale", "revision", "invalidated"] as const) {
    const { client, payload } = fixture();
    try {
      const context = contextForFixture();
      if (variant === "membership") context.propertyIds.push("unloaded-property");
      if (variant === "revision") context.sourceVersions["data-source-1"] = 1;
      await authorizeFixture(client, context);
      if (variant === "stale" || variant === "invalidated") {
        const bootstrap = client
          .getQueryCache()
          .findAll({ queryKey: ["db"] })
          .find((q) => q.queryKey[3] === "bootstrap")!;
        bootstrap.setState(
          variant === "stale" ? { dataUpdatedAt: Date.now() - 31_000 } : { isInvalidated: true },
        );
      }
      assert.equal(readPageDetailPropertyCoverage(client, "page-1").state, "missing", variant);
      let requests = 0;
      await client.fetchQuery(
        pagePropertiesQueryOptions(
          (async () => {
            requests++;
            return {
              workspaceId: "org-1",
              properties: payload.properties.map((p) => p.property),
              values: payload.values,
            };
          }) as ApiFetcher,
          "page-1",
        ),
      );
      assert.equal(requests, 1, variant);
    } finally {
      client.clear();
    }
  }
});

test("an in-flight page detail supplies membership before a duplicate properties request", async () => {
  const { client } = fixture();
  try {
    const ready = Promise.withResolvers<void>();
    let requests = 0;
    const detail = client.fetchQuery(
      pageQueryOptions(
        (async () => {
          await ready.promise;
          return {
            page: {
              id: "page-1",
              workspaceId: "org-1",
              name: "Alpha",
              type: "pageblock",
              url: "#",
              createdAt: "2026-06-01T00:00:00.000Z",
              updatedAt: "2026-06-01T00:00:00.000Z",
            },
            viewerType: "member",
            propertyContext: contextForFixture(),
          };
        }) as ApiFetcher,
        "page-1",
      ),
    );
    const properties = client.fetchQuery(
      pagePropertiesQueryOptions(
        (async () => {
          requests++;
          throw new Error("unexpected request");
        }) as ApiFetcher,
        "page-1",
        { databaseId: "database-1" },
      ),
    );
    ready.resolve();
    await detail;
    await properties;
    assert.equal(requests, 0);
  } finally {
    client.clear();
  }
});
