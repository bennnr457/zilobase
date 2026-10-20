import { expect, test } from "vitest";
import { documentEntries, documentReferences } from "./document-window";

test("reference discovery accepts document resources and relative app links", () => {
  expect(
    documentReferences({
      type: "doc",
      content: [
        { type: "pageBlock", attrs: { pageId: "child" } },
        { type: "databaseBlock", attrs: { databaseId: "db" } },
        { type: "linkMention", attrs: { href: "/pages/linked" } },
        { type: "linkMention", attrs: { href: "https://elsewhere.invalid/pages/external" } },
        {
          type: "paragraph",
          content: [
            { type: "text", marks: [{ type: "link", attrs: { href: "/databases/linked-db" } }] },
          ],
        },
      ],
    }),
  ).toEqual([
    { type: "page", id: "child" },
    { type: "database", id: "db" },
    { type: "page", id: "linked" },
    { type: "database", id: "linked-db" },
  ]);
});

test("large individual blocks split without losing Unicode content or references", () => {
  const text = "हाय 🌿 ".repeat(2000);
  const entries = documentEntries({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text } as never] },
      { type: "pageBlock", attrs: { pageId: "child" } },
    ],
  });
  const chunks = entries.filter((e) => e.kind === "text");
  expect(chunks.length).toBeGreaterThan(10);
  expect(chunks.every((e) => Buffer.byteLength(e.text) <= 1500)).toBe(true);
  expect(
    chunks
      .filter((e) => e.block === 0)
      .map((e) => e.text)
      .join(""),
  ).toBe(text.trim());
  expect(entries.at(-1)).toEqual({ kind: "reference", resource: { type: "page", id: "child" } });
});
