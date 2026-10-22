import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, runWithDbEnv } from "../../infrastructure/database";
import type { RuntimeEnv } from "../../shared/config/config";
import {
  embedSearchDocuments,
  embedSearchQuery,
  recordSearchCooldown,
  reserveSearchUsage,
} from "./embedding-usage";
import type { SearchEmbeddingProvider } from "./vector-contracts";

const url = process.env.ZILOBASE_SEARCH_TEST_DATABASE_URL;
describe.skipIf(!url)("shared embedding budgets and cache", () => {
  const workspace = randomUUID(),
    user = randomUUID(),
    otherUser = randomUUID();
  const scopes: string[] = [];
  const within = <T>(fn: () => Promise<T>) => runWithDbEnv({ DATABASE_URL: url }, fn);
  const environment = (overrides: Record<string, string> = {}) => {
    const scope = randomUUID();
    scopes.push(scope);
    return { SEARCH_EMBEDDING_QUOTA_SCOPE: scope, ...overrides } as RuntimeEnv;
  };
  beforeAll(async () => {
    if (!["localhost", "127.0.0.1"].includes(new URL(url!).hostname))
      throw new Error("Isolated loopback database required");
    await within(async () => {
      await db.execute(
        sql`insert into workspace(id,name,slug) values(${workspace},'Search budget test',${workspace})`,
      );
      for (const id of [user, otherUser])
        await db.execute(
          sql`insert into "user"(id,name,email) values(${id},'Search test',${`${id}@example.test`})`,
        );
    });
  });
  afterAll(async () =>
    within(async () => {
      await db.execute(sql`delete from workspace where id=${workspace}`);
      for (const id of [user, otherUser]) await db.execute(sql`delete from "user" where id=${id}`);
      for (const scope of scopes)
        await db.execute(sql`delete from search_embedding_usage_bucket where quota_scope=${scope}`);
    }),
  );
  it("serializes concurrent reservations across independent runtime scopes", async () => {
    const env = environment({ SEARCH_EMBEDDING_RPM: "5" });
    const outcomes = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        within(() => reserveSearchUsage(env, workspace, "query", 10)),
      ),
    );
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(5);
    for (const outcome of outcomes)
      if (outcome.status === "rejected") expect(outcome.reason.code).toBe("SEARCH_RATE_LIMIT");
  });
  it("reserves interactive capacity while indexing respects daily budgets", async () =>
    within(async () => {
      const env = environment({ SEARCH_EMBEDDING_RPM: "5" });
      for (let i = 0; i < 4; i++) await reserveSearchUsage(env, workspace, "index", 10);
      await expect(reserveSearchUsage(env, workspace, "index", 10)).rejects.toMatchObject({
        code: "SEARCH_RATE_LIMIT",
      });
      await expect(reserveSearchUsage(env, workspace, "query", 10)).resolves.toBeDefined();
      const daily = environment({ SEARCH_EMBEDDING_WORKSPACE_DAILY_TOKENS: "15" });
      await reserveSearchUsage(daily, workspace, "index", 10);
      await expect(reserveSearchUsage(daily, workspace, "index", 10)).rejects.toMatchObject({
        code: "SEARCH_DAILY_BUDGET",
      });
    }));
  it("shares cooldown and keeps unknown usage conservatively reserved", async () =>
    within(async () => {
      const env = environment();
      const provider: SearchEmbeddingProvider = {
        embedDocuments: async () => ({ embeddings: [] }),
        embedQuery: async () => ({ embeddings: [] }),
      };
      await embedSearchDocuments(env, workspace, ["hello"], undefined, provider);
      const usage = (
        await db.execute(
          sql`select reserved_tokens,reported_tokens from search_embedding_usage_bucket where quota_scope=${env.SEARCH_EMBEDDING_QUOTA_SCOPE} and window_kind='minute'`,
        )
      ).rows[0];
      expect(usage).toMatchObject({ reserved_tokens: "5", reported_tokens: "0" });
      await recordSearchCooldown(env, 60000);
      await expect(reserveSearchUsage(env, workspace, "query", 1)).rejects.toMatchObject({
        code: "SEARCH_PROVIDER_COOLDOWN",
      });
    }));
  it("reconciles reported batch usage without inventing per-chunk counts", async () =>
    within(async () => {
      const env = environment();
      const provider: SearchEmbeddingProvider = {
        embedDocuments: async () => ({ embeddings: [], inputTokens: 2 }),
        embedQuery: async () => ({ embeddings: [] }),
      };
      await embedSearchDocuments(env, workspace, ["hello", "world"], undefined, provider);
      const rows = (
        await db.execute(
          sql`select reserved_tokens,reported_tokens from search_embedding_usage_bucket where quota_scope=${env.SEARCH_EMBEDDING_QUOTA_SCOPE}`,
        )
      ).rows;
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.reserved_tokens === "2" && r.reported_tokens === "2")).toBe(true);
    }));
  it("caches vectors by user, workspace, profile, purpose and formatted query, honoring expiry", async () =>
    within(async () => {
      const env = environment();
      const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
      const embedQuery = vi.fn(async () => ({ embeddings: [vector], inputTokens: 1 }));
      const provider: SearchEmbeddingProvider = {
        embedQuery,
        embedDocuments: async () => ({ embeddings: [] }),
      };
      const input = {
        workspaceId: workspace,
        userId: user,
        query: "Login trouble",
        purpose: "search" as const,
      };
      await embedSearchQuery(env, input, provider);
      await embedSearchQuery(env, input, provider);
      expect(embedQuery).toHaveBeenCalledTimes(1);
      await embedSearchQuery(env, { ...input, userId: otherUser }, provider);
      await embedSearchQuery(env, { ...input, purpose: "question_answering" }, provider);
      await embedSearchQuery(env, { ...input, query: "login trouble" }, provider);
      expect(embedQuery).toHaveBeenCalledTimes(4);
      await db.execute(
        sql`update search_query_embedding_cache set expires_at=now()-interval '1 second' where workspace_id=${workspace}`,
      );
      await embedSearchQuery(env, input, provider);
      expect(embedQuery).toHaveBeenCalledTimes(5);
    }));
});
