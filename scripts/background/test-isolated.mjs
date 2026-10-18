import { withBackgroundFixtures, runFixtureScript } from "./fixtures.mjs";

await withBackgroundFixtures(async (env) => {
  await runFixtureScript("apps/server/src/scripts/verify-background-dispatch.ts", {
    ...env,
    ZILOBASE_BACKGROUND_VERIFY_PROCESSOR_ONLY: process.argv.includes("--processor-only")
      ? "true"
      : "",
    ZILOBASE_BACKGROUND_VERIFY_SQL_ONLY:
      process.argv.includes("--sql-only") || process.argv.includes("--worker-sql-only")
        ? "true"
        : "",
  });
  if (!process.argv.includes("--sql-only"))
    await runFixtureScript("apps/server/src/scripts/verify-worker-queues.ts", env, 90_000);
});
