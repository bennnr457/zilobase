import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  archive: vi.fn(),
  record: vi.fn(),
  placement: vi.fn(),
  access: vi.fn(),
}));
vi.mock("../../access", () => ({ canAccessPageInWorkspace: mocks.access }));
vi.mock("./records", () => ({ createRow: mocks.create, setRowArchived: mocks.archive }));
vi.mock("./record-entity", () => ({ getDatabaseRecordEntity: mocks.record }));
vi.mock("../core/position-service", () => ({ lockDatabaseRowOrdering: vi.fn() }));
vi.mock("../../pages/placements", () => ({ upsertPageItemPlacement: mocks.placement }));
vi.mock("../../collaboration/service", () => ({
  encodePageContentAsYjs: (value: unknown) => new TextEncoder().encode(JSON.stringify(value)),
}));
import {
  databaseProperty,
  databaseRow,
  page,
  pageItemPlacement,
} from "../../../infrastructure/database/schema";
import { authorizeRecordAction, dispatchRecordActionCommand } from "./record-actions";
import { runWithDb } from "../../../infrastructure/database";
import type { DatabaseCommandContext } from "./framework";

function harness(destination = "destination", placements: Array<Record<string, unknown>> = []) {
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const original = {
    id: "page",
    workspaceId: "workspace",
    teamspaceId: null,
    name: "Original",
    type: "pageblock",
    url: "#",
    metadata: { emoji: "📌", cover: "cover" },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Body",
              marks: [{ type: "comment", attrs: { threadId: "old" } }, { type: "bold" }],
            },
          ],
        },
      ],
    },
  };
  let pageReads = 0;
  const tx = {
    execute: vi.fn(),
    select: () => {
      let table: unknown;
      const rows = () =>
        table === databaseRow
          ? [{ id: "row", pageId: "page", parentRowId: "parent" }]
          : table === page
            ? [
                pageReads++ === 0
                  ? original
                  : { ...original, id: destination, teamspaceId: "teamspace" },
              ]
            : table === databaseProperty
              ? [
                  { id: "text", type: "text", config: {} },
                  { id: "formula", type: "formula", config: {} },
                  { id: "created", type: "created_time", config: {} },
                  {
                    id: "parent-property",
                    type: "relation",
                    config: { subItems: { role: "parent-item" } },
                  },
                  {
                    id: "child-property",
                    type: "relation",
                    config: { subItems: { role: "sub-item" } },
                  },
                ]
              : table === pageItemPlacement
                ? placements
                : [];
      const builder = {
        from: (next: unknown) => {
          table = next;
          return builder;
        },
        innerJoin: () => builder,
        where: () => builder,
        limit: async () => rows(),
        then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows()).then(resolve),
      };
      return builder;
    },
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        inserted.push({ table, values });
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updates.push({ table, values });
        },
      }),
    }),
  };
  return {
    original,
    inserted,
    updates,
    context: {
      actorId: "user",
      commandId: "command",
      databaseId: "host",
      dataSourceId: "source",
      transaction: tx,
    } as unknown as DatabaseCommandContext,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.record.mockResolvedValue({
    valuesByPropertyId: {
      text: { value: "Stored value" },
      formula: { value: "Computed" },
      created: { value: "Old clock" },
      "child-property": { value: ["unselected-child"] },
    },
  });
  mocks.create.mockResolvedValue({ result: { id: "copy" }, mutations: [] });
  mocks.archive.mockResolvedValue({
    result: { id: "row" },
    mutations: [{ changes: { removedRecordIds: ["row"] } }],
  });
});
test("duplicate clones canonical content and metadata, strips comment marks, and copies only stored values", async () => {
  const h = harness();
  await dispatchRecordActionCommand(h.context, {
    type: "row.duplicate",
    rowId: "row",
    parentRowId: "copied-parent",
  });
  const copy = h.inserted.find((item) => item.table === page)!.values;
  expect(copy.id).not.toBe(h.original.id);
  expect(copy.name).toBe("Original copy");
  expect(copy.metadata).toEqual(h.original.metadata);
  expect(JSON.stringify(copy.content)).toContain('"bold"');
  expect(JSON.stringify(copy.content)).not.toContain('"comment"');
  expect(JSON.stringify(h.original.content)).toContain('"comment"');
  expect(mocks.create.mock.calls[0]![1]).toMatchObject({
    type: "row.place",
    afterRowId: "row",
    parentRowId: "copied-parent",
    hierarchy: {
      parentRowId: "copied-parent",
      parentPropertyId: "parent-property",
      subItemPropertyId: "child-property",
    },
    valuesByPropertyId: { text: "Stored value" },
  });
  expect(mocks.create.mock.calls[0]![1].valuesByPropertyId).not.toHaveProperty("child-property");
});
test("a lone duplicated sub-item retains its original parent without copying descendants", async () => {
  const h = harness();
  await dispatchRecordActionCommand(h.context, { type: "row.duplicate", rowId: "row" });
  expect(mocks.create.mock.calls[0]![1]).toMatchObject({
    parentRowId: "parent",
    hierarchy: { parentRowId: "parent" },
    valuesByPropertyId: { text: "Stored value" },
  });
});

test("linked appearances do not falsely prevent a primary page move", async () => {
  const h = harness("linked-target", [
    { itemId: "linked-target", parentId: "page", placementKind: "linked" },
  ]);
  await dispatchRecordActionCommand(h.context, {
    type: "row.moveToPage",
    rowId: "row",
    pageId: "linked-target",
  });
  expect(mocks.archive).toHaveBeenCalledTimes(1);
  expect(mocks.placement).toHaveBeenCalledWith(
    h.context.transaction,
    expect.objectContaining({ parentId: "linked-target", itemId: "page" }),
  );
});

test("move-to-page removes just the source membership and establishes a primary placement", async () => {
  const h = harness();
  const result = await dispatchRecordActionCommand(h.context, {
    type: "row.moveToPage",
    rowId: "row",
    pageId: "destination",
  });
  expect(mocks.archive).toHaveBeenCalledWith(h.context, { type: "row.archive", rowId: "row" });
  expect(mocks.placement).toHaveBeenCalledWith(
    h.context.transaction,
    expect.objectContaining({ parentId: "destination", itemId: "page", placementKind: "primary" }),
  );
  expect(result!.mutations[0]!.changes.removedRecordIds).toEqual(["row"]);
  expect(h.updates.find((item) => item.table === page)?.values).toMatchObject({
    teamspaceId: "teamspace",
  });
});
test.each([
  ["page", []],
  ["descendant", [{ itemId: "descendant", parentId: "page", placementKind: "primary" }]],
  [
    "nested-row",
    [
      { itemId: "nested-db", parentId: "page", placementKind: "primary" },
      { itemId: "nested-row", parentId: "nested-db", placementKind: "database_row" },
    ],
  ],
])(
  "move-to-page rejects page and database ancestry cycles before removing membership: %s",
  async (destination, placements) => {
    const h = harness(destination, placements as Array<Record<string, unknown>>);
    await expect(
      dispatchRecordActionCommand(h.context, {
        type: "row.moveToPage",
        rowId: "row",
        pageId: destination,
      }),
    ).rejects.toThrow("cycle");
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.placement).not.toHaveBeenCalled();
  },
);
test("unrelated commands do not enter record action transactions", async () => {
  const h = harness();
  expect(
    await dispatchRecordActionCommand(h.context, { type: "row.archive", rowId: "row" }),
  ).toBeNull();
  expect(h.inserted).toHaveLength(0);
});

for (const denied of ["source", "destination", "teamspace"] as const) {
  test(`move-to-page rejects insufficient ${denied} permissions before execution`, async () => {
    const builder = {
      from: () => builder,
      where: () => builder,
      limit: async () => [{ pageId: "original" }],
      then: (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve([
          { id: "original", teamspaceId: "a" },
          { id: "destination", teamspaceId: "b" },
        ]).then(resolve),
    };

    mocks.access.mockImplementation(
      async (id: string, _workspace: string, _actor: string, level: string) =>
        denied === "source"
          ? id !== "original"
          : denied === "destination"
            ? id !== "destination"
            : level !== "full",
    );
    await expect(
      runWithDb({ select: () => builder } as never, () =>
        authorizeRecordAction(
          { type: "row.moveToPage", rowId: "row", pageId: "destination" },
          "source",
          "workspace",
          "actor",
        ),
      ),
    ).rejects.toThrow(denied === "teamspace" ? "Full access" : "Forbidden");
    expect(mocks.archive).not.toHaveBeenCalled();
  });
}
