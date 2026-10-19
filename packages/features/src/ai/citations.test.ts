import assert from "node:assert/strict";
import { test } from "node:test";
import { chatCitations } from "./citations";
test("only exact supplied citation identities resolve and repeated citations collapse", () => {
  const entry = {
    key: "page:allowed",
    id: "allowed",
    type: "page" as const,
    title: "Allowed",
    pageId: "allowed",
    provenance: { capturedAt: "now", origin: "saved" as const },
  };
  assert.deepEqual(
    chatCitations("[[page:allowed]] [[page:allowed]] [[page:secret]] [[https://example.com]]", [
      entry,
    ]),
    [entry],
  );
});
