import { expect, it, vi } from "vitest";
import { preflightVector } from "./vector-preflight";
const database = (rows: unknown[]) => ({ execute: vi.fn().mockResolvedValue({ rows }) });
it("rejects missing or old pgvector before migration", async () => {
  await expect(preflightVector(database([]) as never)).rejects.toThrow("PGVECTOR_REQUIRED");
  await expect(
    preflightVector(database([{ installed: "0.7.4", version: "0.8.7" }]) as never),
  ).rejects.toThrow("UPGRADE_REQUIRED");
});
it("accepts an installed version and installs an available extension", async () => {
  const installed = database([{ installed: "0.8.7", version: "0.8.7" }]);
  await preflightVector(installed as never);
  expect(installed.execute).toHaveBeenCalledTimes(1);
  const available = database([{ installed: null, version: "0.8.7" }]);
  await preflightVector(available as never);
  expect(available.execute).toHaveBeenCalledTimes(2);
});
it("reports missing installation privileges without swallowing the failure", async () => {
  const db = database([{ installed: null, version: "0.8.7" }]);
  db.execute
    .mockResolvedValueOnce({ rows: [{ installed: null, version: "0.8.7" }] })
    .mockRejectedValueOnce(new Error("denied"));
  await expect(preflightVector(db as never)).rejects.toThrow("PRIVILEGES_REQUIRED");
});
