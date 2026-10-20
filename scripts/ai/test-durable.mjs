import { withBackgroundFixtures, runFixtureScript } from "../background/fixtures.mjs";
await withBackgroundFixtures((env) =>
  runFixtureScript("apps/server/src/scripts/verify-durable-ai.ts", env),
);
