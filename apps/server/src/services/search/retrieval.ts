import {
  annSearchCandidates,
  searchEligibleChunkCount,
  SEARCH_EXACT_THRESHOLD,
  SEARCH_CANDIDATE_WINDOWS,
} from "./ann";
import { sql } from "drizzle-orm";
import { db, runWithDb, type Database } from "../../infrastructure/database";
import { getBackgroundCellId } from "../../infrastructure/background/contracts";
import type { RuntimeEnv } from "../../shared/config/config";
import {
  authorizedSearchChunks,
  authorizedSearchIdentities,
  freshSearchChunk,
  searchVectorAccessCtes,
  liveSearchChunkAllowed,
  readAuthorizedSearchChunks,
} from "./eligibility";
import { embedSearchQuery, SearchBudgetDeferred } from "./embedding-usage";
import { SearchEmbeddingError, validateSearchVector } from "./gemini";
import {
  SEARCH_PROFILE,
  type SearchEmbeddingProvider,
  type SearchPurpose,
} from "./vector-contracts";
import {
  searchWorkspaceItems,
  type WorkspaceSearchInput,
  type WorkspaceSearchResult,
} from "./workspace-search";

export type { SearchMetadata } from "@zilobase/features/search";
import type { SearchMetadata } from "@zilobase/features/search";
export type VectorCandidate = { id: string; page_id: string; distance: number };

export async function exactSearchCandidates(
  workspaceId: string,
  userId: string,
  vector: number[],
  limit = 2000,
): Promise<VectorCandidate[]> {
  const value = JSON.stringify(validateSearchVector(vector));
  return (
    await db.execute<VectorCandidate>(
      sql`${searchVectorAccessCtes(workspaceId, userId)}, exact_search_chunks as materialized(select c.id,c.page_id,c.embedding from search_chunk c where ${freshSearchChunk(workspaceId)} and ${liveSearchChunkAllowed(workspaceId)}) select id,page_id,(embedding <=> ${value}::vector) as distance from exact_search_chunks order by embedding <=> ${value}::vector,page_id,id limit ${limit}`,
    )
  ).rows;
}

export function fuseSearchPageRanks(
  keyword: readonly WorkspaceSearchResult[],
  vector: readonly WorkspaceSearchResult[],
  limit: number,
) {
  const entries = new Map<string, { result: WorkspaceSearchResult; score: number }>();
  for (const list of [keyword, vector]) {
    const seen = new Set<string>();
    let rank = 0;
    for (const result of list) {
      const key = `${result.type}:${result.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rank++;
      const existing = entries.get(key);
      entries.set(key, {
        result: existing
          ? {
              ...existing.result,
              ...(result.match ? { match: result.match, excerpt: result.excerpt } : {}),
            }
          : result,
        score: (existing?.score ?? 0) + 1 / (60 + rank),
      });
    }
  }
  return [...entries.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.result.type.localeCompare(b.result.type) ||
        a.result.id.localeCompare(b.result.id),
    )
    .slice(0, limit)
    .map((e) => e.result);
}

function plainExcerpt(markdown: string) {
  return markdown
    .replace(/<[^>]*>/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

export async function hydrateVectorResults(
  workspaceId: string,
  userId: string,
  candidates: readonly VectorCandidate[],
): Promise<WorkspaceSearchResult[]> {
  const chunks = await readAuthorizedSearchChunks(
    workspaceId,
    userId,
    candidates.map((c) => c.id),
  );
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const results: WorkspaceSearchResult[] = [];
  for (const candidate of candidates) {
    const c = byId.get(candidate.id);
    if (!c || seen.has(c.page_id)) continue;
    seen.add(c.page_id);
    const emoji = typeof c.page_metadata?.emoji === "string" ? c.page_metadata.emoji : null;
    results.push({
      id: c.page_id,
      type: "page",
      title: c.name,
      path: c.name,
      emoji,
      updatedAt: c.updated_at,
      excerpt: plainExcerpt(c.content_markdown),
      entity: {
        id: c.page_id,
        name: c.name,
        workspaceId,
        metadata: c.page_metadata,
        updatedAt: c.updated_at,
        deletedAt: null,
      },
      match: {
        chunkId: c.id,
        pageId: c.page_id,
        kind: c.chunk_kind,
        headingPath: c.metadata.headingPath ?? [],
        ...(c.metadata.blockId ? { blockId: c.metadata.blockId } : {}),
        ...(c.metadata.blockIndex !== undefined ? { blockIndex: c.metadata.blockIndex } : {}),
        ...(c.metadata.propertyId && c.database_id && c.data_source_id
          ? {
              propertyId: c.metadata.propertyId,
              databaseId: c.database_id,
              dataSourceId: c.data_source_id,
            }
          : {}),
      },
    });
  }
  return results;
}

async function recheckResults(input: WorkspaceSearchInput, results: WorkspaceSearchResult[]) {
  const allowed = await authorizedSearchIdentities(
    input.workspaceId,
    input.userId,
    results.filter((r) => r.type === "page").map((r) => r.id),
    results.flatMap((r) =>
      r.type === "database"
        ? [r.id, ...(r.titleSource ? [r.titleSource.parentDatabaseId] : [])]
        : [],
    ),
  );
  const matches = await authorizedSearchChunks(
    input.workspaceId,
    input.userId,
    results.flatMap((r) => (r.match ? [r.match.chunkId] : [])),
  );
  return results.flatMap((r) => {
    if (!(r.type === "page" ? allowed.pages.has(r.id) : allowed.databases.has(r.id))) return [];
    if (r.match && !matches.has(r.match.chunkId)) return [];
    if (r.titleSource && !allowed.databases.has(r.titleSource.parentDatabaseId))
      return [{ ...r, title: (r.entity as { name: string }).name, titleSource: null, emoji: null }];
    return [r];
  });
}

export async function hybridSearchWorkspace(
  input: WorkspaceSearchInput,
  env: RuntimeEnv,
  options: { purpose?: SearchPurpose; provider?: SearchEmbeddingProvider } = {},
) {
  const started = Date.now();
  const keyword = searchWorkspaceItems(input);
  // Attach a rejection handler immediately while capability is checked.
  void keyword.catch(() => undefined);
  let metadata: SearchMetadata = {
    mode: "keyword",
    indexAvailability: "disabled",
    degradationReason: "configuration",
  };
  const fallback = async () => ({ results: await recheckResults(input, await keyword), metadata });
  if (env.SEARCH_EMBEDDINGS_ENABLED !== "true" || (!options.provider && !env.GEMINI_API_KEY))
    return fallback();
  const settings = (
    await db.execute<{ enabled: boolean; ready: boolean }>(
      sql`select s.enabled,exists(select 1 from search_chunk c where ${freshSearchChunk(input.workspaceId)} limit 1) as ready from workspace_search_settings s where s.workspace_id=${input.workspaceId} and s.cell_id=${getBackgroundCellId(env)} and s.profile_id=${SEARCH_PROFILE.id}`,
    )
  ).rows[0];
  if (!settings?.enabled) {
    metadata = { ...metadata, degradationReason: "workspace_disabled" };
    return fallback();
  }
  if (!settings.ready) {
    metadata = { ...metadata, indexAvailability: "building", degradationReason: "index_building" };
    return fallback();
  }
  metadata = { mode: "keyword", indexAvailability: "ready" };
  if (!/[\p{L}\p{N}]/u.test(input.query) || (input.types && !input.types.includes("page"))) {
    metadata.degradationReason = "query_empty";
    return fallback();
  }
  const cancellation = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => {
          cancellation.abort();
          reject(new SearchEmbeddingError("SEARCH_QUERY_TIMEOUT", true));
        },
        Math.max(1, Math.min(1800, 2500 - (Date.now() - started))),
      );
    });
    const vector = await Promise.race([
      embedSearchQuery(
        env,
        {
          workspaceId: input.workspaceId,
          userId: input.userId,
          query: input.query,
          purpose: options.purpose ?? "search",
          signal: cancellation.signal,
        },
        options.provider,
      ),
      timeout,
    ]);
    clearTimeout(timer);
    if (Date.now() - started > 2200) {
      metadata.degradationReason = "retrieval_budget";
      return fallback();
    }
    const vectorResults = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('statement_timeout',${String(Math.max(1, 2500 - (Date.now() - started)))},true),set_config('jit','off',true)`,
      );
      // Database context remains this transaction for bounded retrieval and access checks.
      return runWithDb(tx as unknown as Database, async () => {
        const count = await searchEligibleChunkCount(input.workspaceId, input.userId);
        if (count <= SEARCH_EXACT_THRESHOLD)
          return hydrateVectorResults(
            input.workspaceId,
            input.userId,
            await exactSearchCandidates(input.workspaceId, input.userId, vector),
          );
        let matches: WorkspaceSearchResult[] = [];
        for (const window of SEARCH_CANDIDATE_WINDOWS) {
          const remaining = 2500 - (Date.now() - started);
          if (remaining < 100) {
            metadata.degradationReason = "retrieval_budget";
            break;
          }
          await db.execute(sql`select set_config('statement_timeout',${String(remaining)},true)`);
          matches = await hydrateVectorResults(
            input.workspaceId,
            input.userId,
            await annSearchCandidates(input.workspaceId, vector, window),
          );
          if (matches.length >= (input.limit ?? 50)) break;
          if (window === 2000) metadata.degradationReason = "retrieval_budget";
        }
        return matches;
      });
    });
    const results = fuseSearchPageRanks(await keyword, vectorResults, input.limit ?? 50);
    metadata = {
      ...metadata,
      mode: vectorResults.length ? "hybrid" : "keyword",
      indexAvailability: "ready",
    };
    return { results: await recheckResults(input, results), metadata };
  } catch (error) {
    metadata = {
      mode: "keyword",
      indexAvailability: "ready",
      degradationReason:
        error instanceof SearchBudgetDeferred
          ? "capacity"
          : error instanceof SearchEmbeddingError &&
              ["SEARCH_QUERY_TIMEOUT", "SEARCH_PROVIDER_TIMEOUT"].includes(error.code)
            ? "provider_timeout"
            : "provider_unavailable",
    };
    return fallback();
  } finally {
    clearTimeout(timer);
    cancellation.abort();
  }
}
