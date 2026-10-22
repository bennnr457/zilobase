import { withBackgroundFixtures, runFixtureScript } from "../background/fixtures.mjs";
const runtime = process.argv[2] ?? "node";
if (!["node", "worker"].includes(runtime)) throw new Error("Expected node or worker");
await withBackgroundFixtures(
  (env) =>
    runFixtureScript(
      "scripts/search/acceptance.mts",
      { ...env, ZILOBASE_SEARCH_TEST_RUNTIME: runtime },
      600_000,
    ),
  { persistentDatabase: true },
);
