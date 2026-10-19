import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as unknown[][], kind: "member", reads: 0 }));
vi.mock("../../../infrastructure/database/index", () => {
  const select = () => {
    state.reads++;
    const result = Promise.resolve(state.rows.shift() ?? []);
    const chain: Record<string, unknown> = { then: result.then.bind(result) };
    for (const method of ["from", "innerJoin", "where"]) chain[method] = () => chain;
    chain.limit = () => result;
    chain.orderBy = () => result;
    return chain;
  };
  return { db: { select, selectDistinct: select } };
});
vi.mock("../../access/effective-access", () => ({
  canAccessDatabaseInWorkspace: async (id: string) => id !== "hidden",
}));
vi.mock("../../access/principal-access", () => ({
  getWorkspacePrincipalKind: async () => state.kind,
}));
import { getPageDetail } from "./page-detail";
const page = { id: "page", workspaceId: "workspace", createdById: null } as Parameters<
  typeof getPageDetail
>[0];
beforeEach(() => {
  state.rows = [];
  state.kind = "member";
  state.reads = 0;
});
test("member page details include lightweight versioned membership without property values", async () => {
  state.rows = [
    [],
    [],
    [
      {
        databaseId: "host",
        dataSourceId: "source",
        rowId: "row",
        databaseVersion: 8,
        sourceVersion: 5,
      },
      {
        databaseId: "hidden",
        dataSourceId: "hidden-source",
        rowId: "hidden-row",
        databaseVersion: 4,
        sourceVersion: 3,
      },
    ],
    [
      { propertyId: "status", dataSourceId: "source" },
      { propertyId: "private-property", dataSourceId: "hidden-source" },
      { propertyId: "status", dataSourceId: "source" },
    ],
  ];
  const result = await getPageDetail(page, { id: "actor" }, "full", false);
  assert.deepEqual(result.databaseIds, ["host"]);
  assert.deepEqual(result.propertyContext, {
    pageId: "page",
    workspaceId: "workspace",
    propertyIds: ["status", "private-property"],
    databaseIds: ["host"],
    databaseVersions: { host: 8 },
    sourceVersions: { source: 5 },
    presenceTargets: [
      { databaseId: "host", dataSourceId: "source", rowId: "row", propertyIds: ["status"] },
    ],
  });
  assert.equal("values" in result.propertyContext!, false);
  assert.equal(state.reads, 4);
});
test("guest and published page reads retain their existing property authorization path", async () => {
  state.kind = "guest";
  state.rows = [[], [], []];
  const guest = await getPageDetail(page, { id: "guest" }, "view", false);
  assert.equal(guest.propertyContext, undefined);
  assert.equal(state.reads, 3);
  state.reads = 0;
  const published = await getPageDetail(page, null, "view", true);
  assert.equal(published.propertyContext, undefined);
  assert.equal(published.viewerType, "public");
  assert.equal(state.reads, 1);
});
