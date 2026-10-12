import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv } from "./csv";
import { databaseCsvPayload, databaseTemplateRows } from "./payload";
import { getDatabaseSetupTemplate } from "./definitions";

test("CSV parsing and payloads preserve quoted cells, empty columns and untitled rows", () => {
  const parsed = parseCsv(', Notes\r\n"A, B","Line 1\nLine 2"\r\n,"quoted ""word"""\r\n\r\n');
  assert.deepEqual(parsed, {
    headers: ["Name", "Notes"],
    rows: [
      ["A, B", "Line 1\nLine 2"],
      ["", 'quoted "word"'],
    ],
  });
  const payload = databaseCsvPayload(parsed);
  assert.deepEqual(payload.properties, [{ name: "Notes", type: "text" }]);
  assert.equal(payload.rows[0].title, "A, B");
  assert.equal(payload.rows[1].title, "Row 2");
  assert.deepEqual(payload.rows[1].values, [{ propertyName: "Notes", value: 'quoted "word"' }]);
});

test("template payloads use the supplied editor and metadata adapters without changing value identity", () => {
  const template = getDatabaseSetupTemplate("document-hub")!;
  const types = new Map(
    template.properties.map((property) => [property.name.toLowerCase(), property.type]),
  );
  const rows = databaseTemplateRows(
    template,
    types,
    (markdown) => ({ markdown }),
    (emoji) => ({ emoji, source: "web" }),
  );
  assert.equal(rows.length, template.sampleRows.length);
  assert.deepEqual(rows[0].content, { markdown: template.sampleRows[0].content });
  assert.deepEqual(rows[0].metadata, { emoji: template.sampleRows[0].emoji, source: "web" });
  assert.equal(rows[0].title, template.sampleRows[0].title);
});
