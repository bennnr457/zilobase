import { withBackgroundFixtures, runFixtureScript } from "../background/fixtures.mjs";
const runtime = process.argv[2];
if (!["node", "worker"].includes(runtime)) throw new Error("Expected node or worker runtime");
await withBackgroundFixtures((env) =>
  runFixtureScript(
    "scripts/automations/acceptance.mts",
    {
      ...env,
      ZILOBASE_AUTOMATION_TEST_RUNTIME: runtime,
    },
    600_000,
  ),
);
