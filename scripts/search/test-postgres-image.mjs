import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import assert from "node:assert/strict";
import { ensureSearchPostgresImage, SEARCH_POSTGRES_IMAGE } from "./postgres-image.mjs";

const testImage = process.env.ZILOBASE_SEARCH_POSTGRES_TEST_IMAGE ?? SEARCH_POSTGRES_IMAGE;
if (testImage === SEARCH_POSTGRES_IMAGE) ensureSearchPostgresImage();
const prefix = `zilobase-vector-image-${randomUUID()}`;
const volume = `${prefix}-volume`;
const containers = new Set();
const docker = (args, options = {}) => execFileSync("docker", args, { ...options });
const sql = (container, statement) =>
  docker(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    {
      input: statement,
    },
  )
    .toString()
    .trim();
async function start(name, image, persistent = false) {
  docker([
    "run",
    "-d",
    "--name",
    name,
    "--platform",
    process.arch === "arm64" ? "linux/arm64" : "linux/amd64",
    "-e",
    "POSTGRES_PASSWORD=image-test-only",
    ...(persistent ? ["-v", `${volume}:/var/lib/postgresql/data`] : []),
    image,
  ]);
  containers.add(name);
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      sql(name, "select 1");
      return;
    } catch {
      await sleep(200);
    }
  }
  throw new Error("PostgreSQL image did not become ready");
}
try {
  const old = `${prefix}-old`;
  await start(old, "postgres:17.10-alpine", true);
  sql(
    old,
    "create table upgrade_marker(id int primary key); insert into upgrade_marker values(42);",
  );
  docker(["stop", old]);
  docker(["rm", old]);
  containers.delete(old);
  const upgraded = `${prefix}-upgraded`;
  await start(upgraded, testImage, true);
  assert.equal(sql(upgraded, "select id from upgrade_marker"), "42");
  sql(
    upgraded,
    "create extension vector; create table vector_probe(id int primary key, embedding vector(1536)); insert into vector_probe values(1, array_fill(1::real,array[1536])::vector); create index on vector_probe using hnsw(embedding vector_cosine_ops);",
  );
  assert.equal(sql(upgraded, "select vector_dims(embedding) from vector_probe"), "1536");
  assert.equal(
    sql(upgraded, "select extversion from pg_extension where extname='vector'"),
    "0.8.7",
  );
  const dump = docker([
    "exec",
    upgraded,
    "pg_dump",
    "-U",
    "postgres",
    "--format=custom",
    "postgres",
  ]);
  const restored = `${prefix}-restored`;
  await start(restored, testImage);
  docker(
    [
      "exec",
      "-i",
      restored,
      "pg_restore",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "--exit-on-error",
    ],
    { input: dump },
  );
  assert.equal(sql(restored, "select vector_dims(embedding) from vector_probe"), "1536");
  assert.equal(sql(restored, "select id from upgrade_marker"), "42");
  console.log(
    "Verified: PostgreSQL 17 volume upgrade, pgvector 0.8.7, 1536 dimensions, HNSW, backup and restore.",
  );
} finally {
  for (const name of containers) docker(["rm", "-f", name]);
  docker(["volume", "rm", "-f", volume]);
}
