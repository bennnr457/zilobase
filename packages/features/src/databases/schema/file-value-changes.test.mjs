import assert from "node:assert/strict";
import test from "node:test";
import { addDatabaseFile, serializeDatabaseFiles } from "./file-values.ts";
test("file values retain single-file replacement and ordered deduplication", () => {
  const files = ["first", "second"];
  assert.deepEqual(addDatabaseFile(files, " first ", "no_limit"), ["second", "first"]);
  assert.deepEqual(addDatabaseFile(files, " third ", "one_file"), ["third"]);
  assert.equal(addDatabaseFile(files, " ", "one_file"), null);
  assert.equal(serializeDatabaseFiles([], "one_file"), "");
  assert.equal(serializeDatabaseFiles(files, "one_file"), "first");
  assert.equal(serializeDatabaseFiles(files, "no_limit"), files);
  assert.deepEqual(files, ["first", "second"]);
});
