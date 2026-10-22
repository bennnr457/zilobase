import { expect, test } from "vitest";
import { parsePageDocument } from "../index";

test("saved documents accept structured content, JSON content and empty bodies", () => {
  const document = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Saved page" }] },
      { type: "databaseBlock", attrs: { databaseId: "database" } },
    ],
  };
  expect(parsePageDocument(document)).toBe(document);
  expect(parsePageDocument(JSON.stringify(document))).toEqual(document);
  expect(parsePageDocument(null)).toEqual({ type: "doc", content: [] });
});

test.each([
  { type: "doc", content: "bad" },
  { type: "text", text: 123 },
  { type: "paragraph", attrs: [] },
  { type: "text", marks: [{ type: 123 }] },
  { type: "doc", content: [null] },
])("malformed saved content is rejected: %j", (content) => {
  expect(() => parsePageDocument(content)).toThrow(/Invalid/);
});

test("document size, node count and nesting limits survive the parser move", () => {
  expect(() => parsePageDocument({ type: "text", text: "x".repeat(1_000_000) })).toThrow(
    /exceeds context limit/,
  );
  expect(() =>
    parsePageDocument({
      type: "doc",
      content: Array.from({ length: 20_000 }, () => ({ type: "paragraph" })),
    }),
  ).toThrow(/Invalid or oversized/);
  let content: unknown = { type: "text", text: "Deeply nested" };
  for (let depth = 0; depth < 66; depth++) content = { type: "doc", content: [content] };
  expect(() => parsePageDocument(content)).toThrow(/Invalid or oversized/);
});
