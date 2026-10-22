import { sql } from "drizzle-orm";
import type { Database } from "@zilobase/server/node-adapter-api";

/** Called before migrations, including on deployments with indexing disabled. */
export async function preflightVector(database: Pick<Database, "execute">) {
  const available = await database.execute<{ version: string; installed: string | null }>(sql`
    select default_version as version, installed_version as installed
    from pg_available_extensions where name = 'vector'
  `);
  const row = available.rows[0];
  if (!row)
    throw new Error("PGVECTOR_REQUIRED: install pgvector >= 0.8.0 before upgrading Zilobase");
  const version = row.installed ?? row.version;
  const [major, minor] = version.split(".").map(Number);
  if (!Number.isFinite(major) || !(major > 0 || (major === 0 && minor >= 8)))
    throw new Error("PGVECTOR_UPGRADE_REQUIRED: pgvector >= 0.8.0 is required");
  if (!row.installed) {
    try {
      await database.execute(sql`create extension if not exists vector`);
    } catch {
      throw new Error(
        "PGVECTOR_PRIVILEGES_REQUIRED: ask the database owner to run CREATE EXTENSION vector before upgrading",
      );
    }
  }
}
