import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const SEARCH_POSTGRES_IMAGE = "zilobase-postgres:17.10-vector0.8.7";
export function ensureSearchPostgresImage() {
  const present = spawnSync("docker", ["image", "inspect", SEARCH_POSTGRES_IMAGE], {
    stdio: "ignore",
  });
  if (present.status === 0) return;
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const result = spawnSync(
    "docker",
    ["build", "-t", SEARCH_POSTGRES_IMAGE, "-f", "deploy/postgres/Dockerfile", "."],
    { cwd: root, stdio: "inherit" },
  );
  if (result.status !== 0)
    throw new Error("Unable to build the required PostgreSQL/pgvector image");
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === fileURLToPath(new URL(process.argv[1], "file://"))
) {
  ensureSearchPostgresImage();
}
