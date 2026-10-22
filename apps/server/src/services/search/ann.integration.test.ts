import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, runWithDb, runWithDbEnv, type Database } from "../../infrastructure/database";
import { annCandidateQuery, annSearchCandidates, searchEligibleChunkCount } from "./ann";
import { exactSearchCandidates, hydrateVectorResults } from "./retrieval";
import { SEARCH_PROFILE } from "./vector-contracts";

const url = process.env.ZILOBASE_SEARCH_TEST_DATABASE_URL;
describe.skipIf(!url)("partitioned HNSW authorized retrieval", () => {
  const w = randomUUID(),
    u = randomUUID(),
    other = randomUUID();
  const within = <T>(fn: () => Promise<T>) => runWithDbEnv({ DATABASE_URL: url }, fn);
  const query = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
  beforeAll(
    async () =>
      within(async () => {
        if (!["localhost", "127.0.0.1"].includes(new URL(url!).hostname))
          throw new Error("Isolated loopback database required");
        await db.execute(sql`insert into workspace(id,name,slug) values(${w},'ANN test',${w})`);
        for (const id of [u, other])
          await db.execute(
            sql`insert into "user"(id,name,email) values(${id},'Test',${id + "@example.test"})`,
          );
        await db.execute(
          sql`insert into member(id,workspace_id,user_id) values(${randomUUID()},${w},${u})`,
        );
        await db.execute(
          sql`insert into page(id,workspace_id,name,created_by_id,created_at,updated_at) select ${w}||'-'||n,${w},'Page '||n,case when n%3=0 then ${u} else ${other} end,now(),now() from generate_series(1,600) n`,
        );
        await db.execute(
          sql`insert into workspace_search_settings(workspace_id,cell_id,enabled,profile_id) values(${w},'ann-test',true,${SEARCH_PROFILE.id})`,
        );
        await db.execute(
          sql`insert into page_search_index(workspace_id,page_id,profile_id,index_epoch,requested_revision,indexed_revision,status,active_generation_id) select ${w},id,${SEARCH_PROFILE.id},1,1,1,'ready',md5(id)::uuid from page where workspace_id=${w}`,
        );
        await db.execute(
          sql`insert into search_chunk(workspace_id,page_id,profile_id,index_epoch,generation_id,source_revision,chunk_kind,source_key,chunk_index,content_markdown,embedding_input_hash,embedding,is_active,byte_count) select ${w},${w}||'-'||n,${SEARCH_PROFILE.id},1,md5(${w}||'-'||n)::uuid,1,'body','body',0,'Text','hash',array(select case when i=1 then cos(n*0.01) when i=2 then sin(n*0.01) else 0 end::real from generate_series(1,1536)i)::vector,true,4 from generate_series(1,600)n`,
        );
        await db.execute(sql`analyze search_chunk`);
        await db.execute(sql`analyze page_search_index`);
        await db.execute(sql`analyze page`);
        // An attractive but incomplete staging row must never enter either retrieval path.
        await db.execute(
          sql`insert into search_chunk(workspace_id,page_id,profile_id,index_epoch,generation_id,source_revision,chunk_kind,source_key,chunk_index,content_markdown,embedding_input_hash,embedding,is_active,byte_count) values(${w},${w + "-3"},${SEARCH_PROFILE.id},1,${randomUUID()}::uuid,2,'body','body',0,'Unpublished','hash',${JSON.stringify(query)}::vector,false,11)`,
        );
      }),
    20000,
  );
  afterAll(async () =>
    within(async () => {
      await db.execute(sql`delete from workspace where id=${w}`);
      for (const id of [u, other]) await db.execute(sql`delete from "user" where id=${id}`);
    }),
  );
  it("prunes to one hash partition and can use its partial cosine HNSW index", async () =>
    within(async () =>
      db.transaction(async (tx) => {
        await tx.execute(sql`set local enable_seqscan=off`);
        await tx.execute(sql`set local enable_sort=off`);
        const plan = (
          await tx.execute(sql`explain(format json) ${annCandidateQuery(w, query, 100)}`)
        ).rows[0]["QUERY PLAN"];
        const text = JSON.stringify(plan);
        expect(text).toContain("Index Scan");
        expect(text).toContain("embedding_idx");
        const relations = [
          ...new Set([...text.matchAll(/"Relation Name":"(search_chunk_p\d+)"/g)].map((m) => m[1])),
        ];
        expect(relations).toHaveLength(1);
      }),
    ));
  it("refills inaccessible candidates and measures recall against exact authorized results", async () =>
    within(async () =>
      db.transaction(async (tx) => {
        await tx.execute(sql`set local jit=off`);
        await tx.execute(sql`set local statement_timeout='4s'`);
        return runWithDb(tx as unknown as Database, async () => {
          const exact = await hydrateVectorResults(
            w,
            u,
            await exactSearchCandidates(w, u, query, 20),
          );
          const initial = await hydrateVectorResults(
            w,
            u,
            await annSearchCandidates(w, query, 100),
          );
          const expanded = await hydrateVectorResults(
            w,
            u,
            await annSearchCandidates(w, query, 500),
          );
          expect(initial.length).toBeLessThan(50);
          expect(expanded.length).toBeGreaterThanOrEqual(50);
          const oracle = new Set(exact.map((r) => r.id));
          const recall = expanded.slice(0, 20).filter((r) => oracle.has(r.id)).length / 20;
          expect(recall).toBeGreaterThanOrEqual(0.95);
          expect(expanded.some((r) => r.excerpt === "Unpublished")).toBe(false);
        });
      }),
    ));
  it("counts the small eligible set independently of inaccessible chunks", async () =>
    within(async () => {
      expect(await searchEligibleChunkCount(w, u)).toBe(200);
    }));
});
