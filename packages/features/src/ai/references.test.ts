import assert from "node:assert/strict";
import { test } from "node:test";
import { chatReferences, resolveChatReferences } from "./references";
import { chatRequestSchema } from "./contracts";

const id = "f9489ce4-1162-4c67-9aa1-da0d425bf507";
test("typed and pasted references normalize consistently and retain repeated placement", () => {
  assert.deepEqual(
    resolveChatReferences(
      `Compare page:${id} with [[database:db%2Fwith%5Dcharacters]], then [[page:${id}]].`,
    ),
    {
      text: `Compare [[page:${id}]] with [[database:db%2Fwith%5Dcharacters]], then [[page:${id}]].`,
      roots: [
        { type: "page", id },
        { type: "database", id: "db/with]characters" },
      ],
    },
  );
  const input = `Summarize page:${id}.`;
  assert.deepEqual(chatReferences(input), [
    { from: 10, to: input.length - 1, source: { type: "page", id } },
  ]);
});
test("code, escaped markers, malformed references, oversized IDs and URL paths remain text", () => {
  for (const text of [
    "`page:example`",
    "`[[page:example]]",
    "``[[page:example]]``",
    "```md\npage:example\n```",
    "~~~\n[[page:example]]\n~~~~",
    "```\npage:example",
    "https://example.test/page:example",
    "\\[[page:example]]",
    "\\page:example",
    "[[page:%broken]]",
    "[[page:has space]]",
    `page:${"x".repeat(129)}`,
    `[[page:${"x".repeat(129)}]]`,
  ]) {
    assert.deepEqual(chatReferences(text), [], text);
    assert.equal(resolveChatReferences(text).text, text);
  }
  assert.equal(
    resolveChatReferences("`page:example` then page:real").text,
    "`page:example` then [[page:real]]",
  );
});
test("text-only requests derive source scope on the server and remain idempotent", () => {
  const parsed = chatRequestSchema.parse({
    workspaceId: "workspace",
    requestId: "11111111-1111-4111-8111-111111111111",
    text: `Summarize page:${id}`,
  });
  assert.deepEqual(parsed.roots, [{ type: "page", id }]);
  assert.equal(parsed.text, `Summarize [[page:${id}]]`);
  assert.deepEqual(chatRequestSchema.parse(parsed), parsed);
  assert.deepEqual(
    chatRequestSchema.parse({ ...parsed, roots: [{ type: "database", id: "old" }] }).roots,
    [
      { type: "database", id: "old" },
      { type: "page", id },
    ],
  );
  assert.equal(
    chatRequestSchema.safeParse({
      ...parsed,
      text: Array.from({ length: 21 }, (_, i) => `page:p${i}`).join(" "),
      roots: [],
    }).success,
    false,
  );
});

test("references after closed fences remain discoverable", () => {
  for (const fence of ["```", "~~~", "````"]) {
    const text = `${fence}md\n[[page:example]]\n${fence}\nRead page:real`;
    assert.deepEqual(resolveChatReferences(text).roots, [{ type: "page", id: "real" }]);
  }
});
