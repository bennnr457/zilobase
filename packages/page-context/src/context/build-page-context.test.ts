import { expect, test } from "vitest";
import { buildContextMarkdown } from "./build-page-context";
import { contextFixture } from "./fixtures";
import { extractPageMarkdownFromContext } from "./extract-page-markdown-from-context";

test("full context deduplicates sources and preserves collapsed page content", () => {
  const context = contextFixture();
  context.sources.push(context.sources[0]!);
  const result = buildContextMarkdown({ context });
  expect(result.status).toBe("complete");
  expect(result.markdown.match(/## Data source: Tasks/g)).toHaveLength(1);
  expect(result.markdown.match(/Decisions/g)).toHaveLength(1);
  expect(result.markdown).toContain("Ship it");
  expect(
    result.manifest.find((entry) => entry.key === "record:source-tasks:row-child")?.pageId,
  ).toBe("page-subtask");
  const page = extractPageMarkdownFromContext(result.markdown, "page-project");
  expect(page).toContain("Ship it");
  expect(page).not.toContain("## Database:");
  expect(extractPageMarkdownFromContext(result.markdown, "page-pro")).toBeNull();
});

test("budgets omit whole blocks/rows with honest coverage and never mutate input", () => {
  const context = contextFixture();
  context.pages[0]!.content = {
    type: "doc",
    content: [{ type: "codeBlock", content: [{ type: "text", text: "x".repeat(30_000) }] }],
  };
  const original = JSON.stringify(context);
  const result = buildContextMarkdown({ context, maxChars: 12_000 });
  expect(result.status).toBe("partial");
  expect(result.charCount).toBeLessThanOrEqual(12_000);
  expect(result.omissions.join()).toContain("Page body blocks omitted");
  expect(JSON.stringify(context)).toBe(original);
  expect(buildContextMarkdown({ context, maxChars: 100 }).status).toBe("blocked");
});
