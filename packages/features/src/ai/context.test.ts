import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectWorkspaceContext,
  parsePageDocument,
  type ContextDatabaseRead,
  type ContextReadPorts,
} from "./context";

function fixture() {
  const calls: string[] = [];
  const db: ContextDatabaseRead = {
    database: { id: "db", workspaceId: "workspace", name: "DB", pageId: null, version: 1 },
    activeDataSource: { id: "native" },
    dataSources: [
      { id: "native", name: "Native", parentDatabaseId: "db" },
      { id: "unused", name: "No views", parentDatabaseId: "db" },
    ],
    views: [],
    properties: [],
    values: [],
    rowCount: 0,
    rows: [],
  };
  const ports: ContextReadPorts = {
    check: () => {},
    now: () => "2026-10-20T00:00:00Z",
    page: async (id) => ({
      id,
      name: "Page",
      workspaceId: "workspace",
      updatedAt: "1",
      content: { type: "doc", content: [] },
    }),
    database: async (id, source) => {
      calls.push(`${id}:${source ?? "default"}`);
      return { ...db, activeDataSource: { id: source ?? "native" } };
    },
  };
  return { ports, calls };
}

test("local snapshots discover databases and deduplicate explicit attachments and sources", async () => {
  const { ports, calls } = fixture();
  const content = {
    type: "doc",
    content: [{ type: "databaseBlock", attrs: { databaseId: "db" } }],
  };
  const result = await collectWorkspaceContext(
    {
      workspaceId: "workspace",
      roots: [
        { type: "page", id: "page" },
        { type: "database", id: "db" },
      ],
      snapshots: [{ pageId: "page", content, capturedAt: "now" }],
    },
    ports,
  );
  assert.deepEqual(calls, ["db:default", "db:unused"]);
  assert.equal(result.sources.length, 2);
  assert.equal(result.databases.length, 1);
  assert.equal(result.pages[0]?.provenance.origin, "local-editor");
  assert.deepEqual(result.pages[0]?.content, content);
});

test("explicit resource failures reject while embedded failures report partial context", async () => {
  const { ports } = fixture();
  ports.database = async () => {
    throw new Error("Forbidden");
  };
  await assert.rejects(
    collectWorkspaceContext(
      { workspaceId: "workspace", roots: [{ type: "database", id: "db" }] },
      ports,
    ),
    /Forbidden/,
  );
  const result = await collectWorkspaceContext(
    {
      workspaceId: "workspace",
      roots: [{ type: "page", id: "page" }],
      snapshots: [
        {
          pageId: "page",
          capturedAt: "now",
          content: { type: "databaseBlock", attrs: { databaseId: "secret" } },
        },
      ],
    },
    ports,
  );
  assert.equal(result.pages[0]?.coverage.complete, false);
  assert.deepEqual(result.pages[0]?.databaseIds, []);
  assert.equal(result.unavailable.length, 1);
});

test("expired scope, workspace mismatch and malformed documents cannot produce context", async () => {
  const { ports } = fixture();
  await assert.rejects(
    collectWorkspaceContext({ workspaceId: "other", roots: [{ type: "page", id: "page" }] }, ports),
    /outside/,
  );
  let expired = false;
  ports.database = async () => {
    expired = true;
    throw new Error("Network");
  };
  ports.check = () => {
    if (expired) throw new Error("Expired scope");
  };
  await assert.rejects(
    collectWorkspaceContext(
      {
        workspaceId: "workspace",
        roots: [{ type: "page", id: "page" }],
        snapshots: [
          {
            pageId: "page",
            capturedAt: "now",
            content: { type: "databaseBlock", attrs: { databaseId: "db" } },
          },
        ],
      },
      ports,
    ),
    /Expired/,
  );
  assert.throws(() => parsePageDocument({ type: "doc", content: "bad" }), /Invalid/);
  assert.throws(() => parsePageDocument({ type: "text", text: 123 }), /Invalid/);
});

test("computed properties use shared formula semantics and preserve relation IDs and false values", async () => {
  const { ports } = fixture();
  const database = await ports.database("db");
  database.dataSources = database.dataSources.slice(0, 1);
  database.properties = [
    ["amount", "Amount", "number", {}],
    ["twice", "Twice", "formula", { formula: 'prop("Amount") * 2' }],
    ["broken", "Broken", "formula", { formula: "unknownFunction()" }],
    ["done", "Done", "checkbox", {}],
    ["related", "Related", "relation", {}],
  ].map(([id, name, type, config], i) => ({
    id: `binding-${id}`,
    propertyId: String(id),
    position: i,
    property: { id: String(id), name: String(name), type: String(type), config },
  }));
  database.rows = [{ id: "r", pageId: "p", position: 0, page: { name: "Task" } }];
  database.rowCount = 1;
  database.values = [
    { pageId: "p", propertyId: "amount", value: "12" },
    { pageId: "p", propertyId: "done", value: false },
    { pageId: "p", propertyId: "related", value: ["linked-page"] },
  ];
  ports.database = async () => database;
  const result = await collectWorkspaceContext(
    { workspaceId: "workspace", roots: [{ type: "database", id: "db" }] },
    ports,
  );
  const values = new Map(result.sources[0]!.values.map((v) => [v.propertyId, v.value]));
  assert.equal(values.get("twice"), 24);
  assert.equal(values.get("done"), false);
  assert.deepEqual(values.get("related"), ["linked-page"]);
  assert.match(JSON.stringify(values.get("broken")), /unavailable/);
});
