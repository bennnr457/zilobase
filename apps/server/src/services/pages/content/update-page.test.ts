import { beforeEach, expect, test, vi } from "vitest";
import type { PageRecord } from "../read/page-records";
import { replacePageBody } from "./update-page";

const state = vi.hoisted(() => ({
  events: [] as string[],
  replace: vi.fn(),
  revision: vi.fn(),
}));
vi.mock("../../collaboration/mutations/document-mutations", () => ({
  replacePageContent: state.replace,
}));
vi.mock("../read/page-records", () => ({ getPageContentRevision: state.revision }));

beforeEach(() => {
  state.events.length = 0;
  state.replace.mockReset().mockImplementation(async () => {
    state.events.push("replace");
  });
  state.revision.mockReset().mockImplementation(async () => {
    state.events.push("read");
    return { id: "page", updatedAt: new Date("2026-10-18T10:01:00Z") };
  });
});
const record = { id: "page", updatedAt: new Date("2026-10-18T10:00:00Z") } as PageRecord;

test("a stale page revision returns the current timestamp without publishing content", async () => {
  const result = await replacePageBody(
    record,
    { id: "user" },
    { type: "doc" },
    {},
    new Date("2026-10-18T09:59:00Z"),
  );
  expect(result).toEqual({ conflict: { id: record.id, updatedAt: record.updatedAt } });
  expect(state.replace).not.toHaveBeenCalled();
  expect(state.revision).not.toHaveBeenCalled();
});

test("matching and omitted page revisions publish before reading the confirmed revision", async () => {
  for (const baseRevision of [record.updatedAt, undefined]) {
    state.events.length = 0;
    const result = await replacePageBody(record, { id: "user" }, { type: "doc" }, {}, baseRevision);
    expect(result.page?.id).toBe("page");
    expect(state.events).toEqual(["replace", "read"]);
    expect(state.replace).toHaveBeenLastCalledWith({
      content: { type: "doc" },
      env: {},
      pageId: "page",
      userId: "user",
    });
  }
});
