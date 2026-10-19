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
