import { sql } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import { freshSearchChunk, liveSearchChunkAllowed, searchVectorAccessCtes } from "./eligibility";
import { validateSearchVector } from "./gemini";
import { SEARCH_PROFILE } from "./vector-contracts";
import type { VectorCandidate } from "./retrieval";

export const SEARCH_EXACT_THRESHOLD = 10000;
export const SEARCH_ANN_CANDIDATE_LIMIT = 2000;

export async function searchEligibleChunkCount(workspaceId: string, userId: string) {
  return Number(
    (
      await db.execute<{ count: string }>(
        sql`${searchVectorAccessCtes(workspaceId, userId)} select count(*)::text from(select 1 from search_chunk c
          join page_search_index i on i.workspace_id=c.workspace_id and i.page_id=c.page_id and i.profile_id=c.profile_id and i.active_generation_id=c.generation_id and i.index_epoch=c.index_epoch and i.indexed_revision=c.source_revision and i.indexed_revision=i.requested_revision
          join workspace_search_settings s on s.workspace_id=i.workspace_id and s.enabled and s.profile_id=i.profile_id and s.index_epoch=i.index_epoch
          join page p on p.id=c.page_id and p.workspace_id=c.workspace_id and p.deleted_at is null
          where c.workspace_id=${workspaceId} and c.profile_id=${SEARCH_PROFILE.id} and c.is_active and c.embedding is not null and ${liveSearchChunkAllowed(workspaceId)} limit ${SEARCH_EXACT_THRESHOLD + 1}) eligible`,
      )
    ).rows[0].count,
  );
}
export function annCandidateQuery(
  workspaceId: string,
  userId: string,
  vector: readonly number[],
  limit: number,
) {
  const value = JSON.stringify(validateSearchVector(vector));
  return sql`${searchVectorAccessCtes(workspaceId, userId)} select c.id,c.page_id,(c.embedding <=> ${value}::vector) as distance from search_chunk c where ${freshSearchChunk(workspaceId)} and ${liveSearchChunkAllowed(workspaceId)} order by c.embedding <=> ${value}::vector limit ${limit}`;
}
/** Must be called in the retrieval transaction: settings never escape a pooled connection. */
export async function annSearchCandidates(
  workspaceId: string,
  userId: string,
  vector: number[],
  limit: number,
) {
  const effort = limit <= 100 ? 100 : limit <= 500 ? 500 : 1000;
  await db.execute(
    sql`select set_config('hnsw.ef_search',${String(effort)},true),set_config('hnsw.iterative_scan','relaxed_order',true),set_config('hnsw.max_scan_tuples',${limit <= 100 ? "20000" : "100000"},true),set_config('hnsw.scan_mem_multiplier','4',true)`,
  );
  return (
    await db.execute<VectorCandidate>(annCandidateQuery(workspaceId, userId, vector, limit))
  ).rows.sort(
    (a, b) =>
      a.distance - b.distance || a.page_id.localeCompare(b.page_id) || a.id.localeCompare(b.id),
  );
}
