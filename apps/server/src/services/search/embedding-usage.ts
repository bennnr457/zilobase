import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "../../infrastructure/database";
import { getBackgroundCellId } from "../../infrastructure/background/contracts";
import type { RuntimeEnv } from "../../shared/config/config";
import { byteLength } from "./chunking";
import {
  createGeminiEmbeddingProvider,
  SearchEmbeddingError,
  validateSearchVector,
} from "./gemini";
import {
  queryEmbeddingInput,
  SEARCH_PROFILE,
  type EmbeddingResult,
  type SearchEmbeddingProvider,
  type SearchPurpose,
} from "./vector-contracts";

export class SearchBudgetDeferred extends Error {
  constructor(
    public readonly code: string,
    public readonly availableAt: string,
  ) {
    super(code);
    this.name = "SearchBudgetDeferred";
  }
}
export function searchNumber(env: RuntimeEnv, key: string, fallback: number) {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new SearchEmbeddingError("SEARCH_CONFIGURATION_INVALID", false);
  return value;
}
const quotaScope = (env: RuntimeEnv) =>
  typeof env.SEARCH_EMBEDDING_QUOTA_SCOPE === "string" && env.SEARCH_EMBEDDING_QUOTA_SCOPE.trim()
    ? env.SEARCH_EMBEDDING_QUOTA_SCOPE.trim()
    : `${getBackgroundCellId(env)}:gemini-embedding-2`;
type Bucket = { scope: string; window: string; kind: string; traffic: string };
type Reservation = { quota: string; tokens: number; buckets: Bucket[] };

export async function reserveSearchUsage(
  env: RuntimeEnv,
  workspaceId: string,
  traffic: "query" | "index",
  tokens: number,
): Promise<Reservation> {
  if (!Number.isSafeInteger(tokens) || tokens < 1)
    throw new SearchEmbeddingError("SEARCH_USAGE_INVALID", false);
  const quota = quotaScope(env);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`search-quota:${quota}`},0))`,
    );
    const {
      rows: [clock],
    } = await tx.execute<{ now: string }>(sql`select clock_timestamp()::text as now`);
    const now = new Date(clock.now);
    const minute = new Date(Math.floor(now.getTime() / 60000) * 60000).toISOString();
    const day = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString();
    const cooldown = (
      await tx.execute<{ until: string | null }>(
        sql`select max(cooldown_until)::text as until from search_embedding_usage_bucket where quota_scope=${quota} and window_kind='cooldown'`,
      )
    ).rows[0]?.until;
    if (cooldown && Date.parse(cooldown) > now.getTime())
      throw new SearchBudgetDeferred("SEARCH_PROVIDER_COOLDOWN", new Date(cooldown).toISOString());
    const usage = (
      await tx.execute<{
        requests: string;
        tokens: string;
        index_requests: string;
        index_tokens: string;
      }>(sql`
      select coalesce(sum(requests),0)::text as requests,coalesce(sum(reserved_tokens),0)::text as tokens,
      coalesce(sum(requests) filter(where traffic_class='index'),0)::text as index_requests,
      coalesce(sum(reserved_tokens) filter(where traffic_class='index'),0)::text as index_tokens
      from search_embedding_usage_bucket where quota_scope=${quota} and bucket_scope='deployment' and window_kind='minute' and window_start=${minute}::timestamptz
    `)
    ).rows[0];
    const requests = searchNumber(env, "SEARCH_EMBEDDING_RPM", 30),
      tpm = searchNumber(env, "SEARCH_EMBEDDING_TPM", 100000);
    if (
      Number(usage.requests) + 1 > requests ||
      Number(usage.tokens) + tokens > tpm ||
      (traffic === "index" &&
        (Number(usage.index_requests) + 1 > Math.floor(requests * 0.8) ||
          Number(usage.index_tokens) + tokens > Math.floor(tpm * 0.8)))
    )
      throw new SearchBudgetDeferred(
        "SEARCH_RATE_LIMIT",
        new Date(Date.parse(minute) + 60000).toISOString(),
      );
    const buckets: Bucket[] = [{ scope: "deployment", window: minute, kind: "minute", traffic }];
    if (traffic === "index") {
      const daily = (
        await tx.execute<{ bucket_scope: string; tokens: string }>(
          sql`select bucket_scope,reserved_tokens::text as tokens from search_embedding_usage_bucket where quota_scope=${quota} and bucket_scope in ('deployment',${`workspace:${workspaceId}`}) and window_kind='day' and window_start=${day}::timestamptz and traffic_class='index'`,
        )
      ).rows;
      for (const [scope, maximum] of [
        ["deployment", searchNumber(env, "SEARCH_EMBEDDING_DAILY_TOKENS", 10000000)],
        [
          `workspace:${workspaceId}`,
          searchNumber(env, "SEARCH_EMBEDDING_WORKSPACE_DAILY_TOKENS", 1000000),
        ],
      ] as const) {
        if (Number(daily.find((x) => x.bucket_scope === scope)?.tokens ?? 0) + tokens > maximum)
          throw new SearchBudgetDeferred(
            "SEARCH_DAILY_BUDGET",
            new Date(Date.parse(day) + 86400000).toISOString(),
          );
        buckets.push({ scope, window: day, kind: "day", traffic });
      }
    }
    for (const b of buckets)
      await tx.execute(sql`insert into search_embedding_usage_bucket(quota_scope,bucket_scope,window_start,window_kind,traffic_class,requests,reserved_tokens)
      values(${quota},${b.scope},${b.window}::timestamptz,${b.kind},${b.traffic},1,${tokens})
      on conflict(quota_scope,bucket_scope,window_start,window_kind,traffic_class) do update set requests=search_embedding_usage_bucket.requests+1,reserved_tokens=search_embedding_usage_bucket.reserved_tokens+excluded.reserved_tokens,updated_at=now()`);
    return { quota, tokens, buckets };
  });
}

async function reportUsage(reservation: Reservation, reported: number | undefined) {
  if (reported === undefined) return;
  await db.transaction(async (tx) => {
    for (const b of reservation.buckets)
      await tx.execute(sql`update search_embedding_usage_bucket set reserved_tokens=reserved_tokens+${reported - reservation.tokens},reported_tokens=reported_tokens+${reported},updated_at=now()
      where quota_scope=${reservation.quota} and bucket_scope=${b.scope} and window_start=${b.window}::timestamptz and window_kind=${b.kind} and traffic_class=${b.traffic}`);
  });
}
export async function recordSearchCooldown(env: RuntimeEnv, delay: number) {
  await db.execute(sql`insert into search_embedding_usage_bucket(quota_scope,bucket_scope,window_start,window_kind,traffic_class,cooldown_until)
    values(${quotaScope(env)},'deployment','1970-01-01'::timestamptz,'cooldown','all',clock_timestamp()+${Math.max(1000, Math.min(delay, 43200000))}*interval '1 millisecond')
    on conflict(quota_scope,bucket_scope,window_start,window_kind,traffic_class) do update set cooldown_until=greatest(search_embedding_usage_bucket.cooldown_until,excluded.cooldown_until),updated_at=now()`);
}
async function budgeted(
  env: RuntimeEnv,
  workspaceId: string,
  traffic: "query" | "index",
  inputs: readonly string[],
  call: () => Promise<EmbeddingResult>,
) {
  const reservation = await reserveSearchUsage(
    env,
    workspaceId,
    traffic,
    inputs.reduce((sum, input) => sum + byteLength(input), 0),
  );
  try {
    const result = await call();
    await reportUsage(reservation, result.inputTokens);
    return result;
  } catch (error) {
    if (error instanceof SearchEmbeddingError && error.code === "SEARCH_PROVIDER_RATE_LIMIT")
      await recordSearchCooldown(env, error.retryAfterMs ?? 60000);
    throw error;
  }
}
export function embedSearchDocuments(
  env: RuntimeEnv,
  workspaceId: string,
  inputs: readonly string[],
  signal?: AbortSignal,
  provider?: SearchEmbeddingProvider,
) {
  const client = provider ?? createGeminiEmbeddingProvider(String(env.GEMINI_API_KEY ?? ""));
  return budgeted(env, workspaceId, "index", inputs, () => client.embedDocuments(inputs, signal));
}
export async function embedSearchQuery(
  env: RuntimeEnv,
  input: {
    workspaceId: string;
    userId: string;
    query: string;
    purpose: SearchPurpose;
    signal?: AbortSignal;
  },
  provider?: SearchEmbeddingProvider,
) {
  const formatted = queryEmbeddingInput(input.query, input.purpose);
  const hash = createHash("sha256")
    .update(SEARCH_PROFILE.id)
    .update("\0")
    .update(formatted)
    .digest("hex");
  const cached = (
    await db.execute<{ embedding: string }>(
      sql`select embedding::text from search_query_embedding_cache where workspace_id=${input.workspaceId} and user_id=${input.userId} and profile_id=${SEARCH_PROFILE.id} and purpose=${input.purpose} and input_hash=${hash} and expires_at>clock_timestamp()`,
    )
  ).rows[0];
  if (cached) return validateSearchVector(JSON.parse(cached.embedding));
  const client = provider ?? createGeminiEmbeddingProvider(String(env.GEMINI_API_KEY ?? ""));
  const result = await budgeted(env, input.workspaceId, "query", [formatted], () =>
    client.embedQuery(input.query, input.purpose, input.signal),
  );
  const vector = validateSearchVector(result.embeddings[0]);
  await db.execute(sql`insert into search_query_embedding_cache(workspace_id,user_id,profile_id,purpose,input_hash,embedding,expires_at)
    values(${input.workspaceId},${input.userId},${SEARCH_PROFILE.id},${input.purpose},${hash},${JSON.stringify(vector)}::vector,clock_timestamp()+interval '10 minutes')
    on conflict(workspace_id,user_id,profile_id,purpose,input_hash) do update set embedding=excluded.embedding,expires_at=excluded.expires_at`);
  return vector;
}
