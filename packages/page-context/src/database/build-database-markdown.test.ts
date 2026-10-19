import { expect, test } from "vitest";
import { contextFixture } from "../context/fixtures";
import {
  renderDatabaseHost,
  renderDataSource,
  configurationMarkdown,
} from "./build-database-markdown";

test("database views preserve full configuration while records are rendered once per source", () => {
  const context = contextFixture();
  const markdown = [
    ...context.databases.map(renderDatabaseHost),
    ...context.sources.map(renderDataSource),
  ].join("\n\n");
  expect(markdown.match(/## Data source: Tasks/g)).toHaveLength(1);
  expect(markdown.match(/### View:/g)).toHaveLength(6);
  expect(markdown).toContain('"operator": "or"');
  expect(markdown).toContain('"hiddenPropertyIds"');
  expect(markdown).toContain("Cost (prop-cost)");
  expect(markdown).toContain("Binding ID: binding-cost");
  expect(markdown).toContain("row-child | page-subtask | row-parent");
  expect(markdown).toContain("Parent \\| task | 0 | false |");
  expect(markdown).toContain('"pageId":"page-other"');
  expect(markdown).toContain('— (missing) | — (missing) | ""');
  expect(markdown).toContain("## Data source: No views");
});

test("configuration fence cannot be closed by values containing backticks", () => {
  expect(configurationMarkdown({ value: "```" })).toMatch(/^````json\n/);
});
