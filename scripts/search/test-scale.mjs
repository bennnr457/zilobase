import { execFileSync } from "node:child_process";
import { readFile, writeFile, rm } from "node:fs/promises";
import { withBackgroundFixtures, runFixtureScript } from "../background/fixtures.mjs";

await withBackgroundFixtures(
  async (env) => {
    const reportPath = ".test-results/search/scale.json";
    await rm(reportPath, { force: true });
    try {
      await runFixtureScript("scripts/search/benchmark.mts", env, 7_200_000);
    } finally {
      // Capture before fixture cleanup. cgroup peak includes PostgreSQL file cache.
      const saved = await readFile(reportPath, "utf8").catch(() => null);
      if (saved) {
        const report = JSON.parse(saved);
        const info = JSON.parse(execFileSync("docker", ["info", "--format", "{{json .}}"]));
        const peak = Number(
          execFileSync("docker", [
            "exec",
            env.ZILOBASE_DATABASE_VERIFY_CONTAINER,
            "cat",
            "/sys/fs/cgroup/memory.peak",
          ])
            .toString()
            .trim(),
        );
        report.machine.docker = { cpus: info.NCPU, memoryBytes: info.MemTotal };
        report.machine.postgresCgroupPeakBytesIncludingCache = peak;
        report.machine.maintenanceWorkMem = "2GB";
        report.machine.parallelMaintenanceWorkers = 2;
        await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
      }
    }
  },
  { persistentDatabase: true, postgresShmSize: "3g" },
);
