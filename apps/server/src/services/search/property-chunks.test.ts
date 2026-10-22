import { describe, expect, it } from "vitest";
import {
  chunkStoredProperties,
  serializeSearchProperty,
  type StoredSearchProperty,
} from "./property-chunks";
const property = (type: string, value: unknown): StoredSearchProperty => ({
  id: "p",
  name: "Status",
  type,
  value,
  config: {
    options: [
      { id: "blocked", name: "Blocked" },
      { id: "done", name: "Done" },
    ],
  },
  definitionRevision: "2",
  valueRevision: "3",
});
describe("stored property chunks", () => {
  it.each([
    ["text", "notes", "notes"],
    ["number", 12.5, "12.5"],
    ["number", "0012.50", "12.5"],
    ["checkbox", false, "unchecked"],
    ["checkbox", true, "checked"],
    ["date", { start: "2026-01-01", end: "2026-02-01" }, "2026-01-01 to 2026-02-01"],
    ["url", "https://example.test", "https://example.test"],
    ["email", "a@example.test", "a@example.test"],
    ["phone", "+12345", "+12345"],
    ["id", "ISSUE-1", "ISSUE-1"],
    ["select", "blocked", "Blocked"],
    ["select", "Blocked", "Blocked"],
    ["status", "Done", "Done"],
    ["multi_select", ["Blocked", "Done"], "Blocked, Done"],
    ["status", "done", "Done"],
    ["multi_select", ["blocked", "done"], "Blocked, Done"],
  ])("serializes %s values", (type, value, expected) => {
    expect(serializeSearchProperty(property(String(type), value))).toBe(expected);
  });
  it.each([
    "person",
    "files",
    "relation",
    "formula",
    "rollup",
    "button",
    "place",
    "verification",
    "created_time",
    "edited_time",
  ])("excludes %s", (type) => {
    expect(serializeSearchProperty(property(type, "secret"))).toBe("");
  });
  it("does not preserve deleted options, malformed values or null", () => {
    expect(serializeSearchProperty(property("select", "removed"))).toBe("");
    expect(serializeSearchProperty(property("text", { arbitrary: "secret" }))).toBe("");
    expect(serializeSearchProperty(property("number", "Infinity"))).toBe("");
    expect(serializeSearchProperty(property("text", null))).toBe("");
  });
  it("deduplicates memberships but keeps separate property provenance", () => {
    const a = property("select", "blocked"),
      b = { ...property("text", "private"), id: "other" };
    const chunks = chunkStoredProperties("Release", [a, a, b]);
    expect(chunks).toHaveLength(2);
    expect(chunks.find((x) => x.sourceKey === "p")?.metadata).toMatchObject({
      propertyId: "p",
      definitionRevision: "2",
      valueRevision: "3",
    });
    expect(chunks.find((x) => x.sourceKey === "p")?.input).not.toContain("private");
    expect(chunks.find((x) => x.sourceKey === "p")?.input).toContain(a.name + ": Blocked");
  });
});
