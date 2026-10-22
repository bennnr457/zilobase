import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const filename = process.argv[2];
if (!filename)
  throw new Error("Usage: node scripts/search/check-worker-bundle.mjs /absolute/path/to/worker.js");
const [bundle, map] = await Promise.all([
  readFile(filename, "utf8"),
  readFile(filename + ".map", "utf8").then(JSON.parse),
]);
const forbidden = /node_modules\/(?:bullmq|ioredis|@aws-sdk)\//;
assert.ok(
  !map.sources.some((source) => forbidden.test(source)),
  "Worker bundle contains a Node transport or storage SDK",
);
assert.ok(
  !/\b(?:from|import\()\s*["']node:(?:fs|child_process)/.test(bundle),
  "Worker bundle contains filesystem or process execution imports",
);
assert.ok(
  map.sources.some((source) => source.endsWith("/services/search/indexing.ts")),
  "Worker bundle is missing the shared search handler",
);
console.info(
  JSON.stringify({ event: "search.worker_bundle_verified", sourceCount: map.sources.length }),
);
