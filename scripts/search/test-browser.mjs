import { withBackgroundFixtures, runFixtureScript } from "../background/fixtures.mjs";
await withBackgroundFixtures((env) =>
  runFixtureScript(
    "scripts/search/acceptance.mts",
    {
      ...env,
      ZILOBASE_SEARCH_TEST_RUNTIME: "node",
      ZILOBASE_SEARCH_BROWSER: "true",
      ZILOBASE_SEARCH_BROWSER_ONLY: "true",
    },
    300_000,
  ),
);
