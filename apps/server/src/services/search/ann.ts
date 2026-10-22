import { sql } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import { freshSearchChunk, liveSearchChunkAllowed, searchVectorAccessCtes } from "./eligibility";
import { validateSearchVector } from "./gemini";
import type { VectorCandidate } from "./retrieval";

export const SEARCH_EXACT_THRESHOLD = 10000;
export const SEARCH_CANDIDATE_WINDOWS = [100, 500, 2000] as const;

export async function searchEligibleChunkCount(workspaceId: string, userId: string) {
  return Number(
    (
      await db.execute<{ count: string }>(
        sql`${searchVectorAccessCtes(workspaceId, userId)} select count(*)::text from(select 1 from search_chunk c where ${freshSearchChunk(workspaceId)} and ${liveSearchChunkAllowed(workspaceId)} limit ${SEARCH_EXACT_THRESHOLD + 1}) eligible`,
      )
    ).rows[0].count,
  );
}
export function annCandidateQuery(workspaceId: string, vector: readonly number[], limit: number) {
  const value = JSON.stringify(validateSearchVector(vector));
  return sql`select c.id,c.page_id,(c.embedding <=> ${value}::vector) as distance from search_chunk c where ${freshSearchChunk(workspaceId)} order by c.embedding <=> ${value}::vector limit ${limit}`;
}
/** Must be called in the retrieval transaction: settings never escape a pooled connection. */
export async function annSearchCandidates(workspaceId: string, vector: number[], limit: number) {
  await db.execute(
    sql`select set_config('hnsw.ef_search','100',true),set_config('hnsw.iterative_scan','strict_order',true),set_config('hnsw.max_scan_tuples','20000',true)`,
  );
  return (
    await db.execute<VectorCandidate>(annCandidateQuery(workspaceId, vector, limit))
  ).rows.sort(
    (a, b) =>
      a.distance - b.distance || a.page_id.localeCompare(b.page_id) || a.id.localeCompare(b.id),
  );
}
