import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, runWithDbEnv } from "../../infrastructure/database";
import { createBackgroundTask } from "../../infrastructure/background/contracts";
import { indexSearchPage, type SearchTaskInput } from "./indexing";
import { SEARCH_PROFILE, type SearchEmbeddingProvider } from "./vector-contracts";
import { SearchEmbeddingError } from "./gemini";

const url = process.env.ZILOBASE_SEARCH_TEST_DATABASE_URL;
describe.skipIf(!url)("fenced resumable indexing", () => {
  let workspace: string, page: string, input: SearchTaskInput;
  const within = <T>(fn: () => Promise<T>) => runWithDbEnv({ DATABASE_URL: url }, fn);
  const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
  const provider = (): SearchEmbeddingProvider => ({
    embedDocuments: vi.fn(async (inputs) => ({ embeddings: inputs.map(() => vector) })),
    embedQuery: async () => ({ embeddings: [vector] }),
  });
  const state = async () =>
    (
      await db.execute(
        sql`select * from page_search_index where workspace_id=${workspace} and page_id=${page}`,
      )
    ).rows[0];
  const content = (text: string) =>
    JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });
  const schedule = async () => {
    input = {
      ...input,
      task: createBackgroundTask({ env: input.env, kind: "search.page_index", resourceId: page }),
    };
    await db.execute(
      sql`update page_search_index set pending_task_id=${input.task.taskId}::uuid,not_before=now() where workspace_id=${workspace}`,
    );
  };
  beforeAll(() => {
    if (!["localhost", "127.0.0.1"].includes(new URL(url!).hostname))
      throw new Error("Isolated loopback database required");
  });
  beforeEach(async () =>
    within(async () => {
      workspace = randomUUID();
      page = randomUUID();
      const env = {
        SEARCH_EMBEDDINGS_ENABLED: "true",
        ZILOBASE_CELL_ID: "search-test",
        SEARCH_EMBEDDING_QUOTA_SCOPE: workspace,
        SEARCH_EMBEDDING_RPM: "1000",
      };
      input = {
        env,
        task: createBackgroundTask({ env, kind: "search.page_index", resourceId: page }),
        workerId: randomUUID(),
      };
      await db.execute(
        sql`insert into workspace(id,name,slug) values(${workspace},'Index test',${workspace})`,
      );
      await db.execute(
        sql`insert into workspace_search_settings(workspace_id,cell_id,enabled,profile_id) values(${workspace},'search-test',true,${SEARCH_PROFILE.id})`,
      );
      await db.execute(
        sql`insert into page(id,workspace_id,name,content,created_at,updated_at) values(${page},${workspace},'Credentials',${content("Rotate the token")},now(),now())`,
      );
      await schedule();
    }),
  );
  afterEach(async () => {
    vi.restoreAllMocks();
    await within(async () => {
      await db.execute(sql`delete from background_dispatch where resource_id=${page}`);
      await db.execute(sql`delete from workspace where id=${workspace}`);
      await db.execute(
        sql`delete from search_embedding_usage_bucket where quota_scope=${workspace}`,
      );
    });
  });
  it("publishes a complete generation once and reuses unchanged inputs after an edit", async () =>
    within(async () => {
      const fake = provider();
      expect(await indexSearchPage(input, { provider: fake })).toEqual({ outcome: "completed" });
      expect(await state()).toMatchObject({
        status: "ready",
        requested_revision: "1",
        indexed_revision: "1",
        completed_chunk_count: 2,
      });
      await indexSearchPage(input, { provider: fake });
      expect(fake.embedDocuments).toHaveBeenCalledTimes(1);
      await db.execute(
        sql`update page set content=${content("The revised token process")} where id=${page}`,
      );
      await schedule();
      await indexSearchPage(input, { provider: fake });
      expect(fake.embedDocuments).toHaveBeenLastCalledWith(
        [expect.stringContaining("revised token")],
        undefined,
      );
      const counts = (
        await db.execute(
          sql`select is_active,count(*)::integer as count from search_chunk where workspace_id=${workspace} group by is_active order by is_active`,
        )
      ).rows;
      expect(counts).toEqual([
        { is_active: false, count: 2 },
        { is_active: true, count: 2 },
      ]);
      expect((await state()).indexed_revision).toBe("2");
    }));
  it("fences edits that commit while the provider is running", async () =>
    within(async () => {
      const fake = provider();
      fake.embedDocuments = async (inputs) => {
        await db.execute(sql`update page set name='New title' where id=${page}`);
        return { embeddings: inputs.map(() => vector) };
      };
      await indexSearchPage(input, { provider: fake });
      expect(await state()).toMatchObject({
        status: "pending",
        requested_revision: "2",
        indexed_revision: "0",
        pending_task_id: null,
      });
      expect(
        (
          await db.execute(
            sql`select 1 from search_chunk where workspace_id=${workspace} and is_active`,
          )
        ).rows,
      ).toHaveLength(0);
    }));
  it("fences disablement during a provider call", async () =>
    within(async () => {
      const fake = provider();
      fake.embedDocuments = async (inputs) => {
        await db.execute(
          sql`update workspace_search_settings set enabled=false,index_epoch=index_epoch+1 where workspace_id=${workspace}`,
        );
        return { embeddings: inputs.map(() => vector) };
      };
      await indexSearchPage(input, { provider: fake });
      expect((await state()).indexed_revision).toBe("0");
      expect(
        (
          await db.execute(
            sql`select 1 from search_chunk where workspace_id=${workspace} and is_active`,
          )
        ).rows,
      ).toHaveLength(0);
    }));
  it("rejects a competing worker and a late return from an expired lease", async () =>
    within(async () => {
      const fake = provider();
      let competing: unknown;
      fake.embedDocuments = async (inputs) => {
        competing = await indexSearchPage(
          { ...input, workerId: "competitor" },
          { provider: provider() },
        );
        await db.execute(
          sql`update page_search_index set lease_expires_at=now()-interval '1 second' where workspace_id=${workspace}`,
        );
        await indexSearchPage({ ...input, workerId: "reclaimed" }, { provider: provider() });
        return { embeddings: inputs.map(() => vector) };
      };
      await indexSearchPage(input, { provider: fake });
      expect(competing).toEqual({ outcome: "noop" });
      expect(await state()).toMatchObject({
        status: "ready",
        lease_fence: "2",
        indexed_revision: "1",
      });
    }));
  it("checkpoints batches and resumes through a new durable task", async () =>
    within(async () => {
      await db.execute(
        sql`update page set content=${content("long text ".repeat(8000))} where id=${page}`,
      );
      await schedule();
      const clock = vi.spyOn(Date, "now");
      const start = Date.now();
      clock.mockReturnValue(start);
      const fake = provider();
      fake.embedDocuments = vi.fn(async (inputs) => {
        clock.mockReturnValue(start + 25000);
        return { embeddings: inputs.map(() => vector) };
      });
      await indexSearchPage(input, { provider: fake });
      const partial = await state();
      expect(partial).toMatchObject({
        status: "pending",
        completed_chunk_count: 16,
        indexed_revision: "0",
      });
      expect(partial.pending_task_id).not.toBe(input.task.taskId);
      expect(
        (
          await db.execute(
            sql`select 1 from search_chunk where workspace_id=${workspace} and is_active`,
          )
        ).rows,
      ).toHaveLength(0);
      clock.mockRestore();
      const task = (
        await db.execute<{ task: SearchTaskInput["task"] }>(
          sql`select task from background_dispatch where id=${partial.pending_task_id}`,
        )
      ).rows[0].task;
      await indexSearchPage({ ...input, task }, { provider: provider() });
      expect((await state()).status).toBe("ready");
    }));
  it("keeps terminal provider failures visible and schedules retryable failures durably", async () =>
    within(async () => {
      const fake = provider();
      fake.embedDocuments = async () => {
        throw new SearchEmbeddingError("SEARCH_PROVIDER_AUTH", false);
      };
      expect(await indexSearchPage(input, { provider: fake })).toMatchObject({
        outcome: "terminal",
      });
      expect(await state()).toMatchObject({
        status: "failed",
        last_error_code: "SEARCH_PROVIDER_AUTH",
      });
      await db.execute(
        sql`update page_search_index set status='pending' where workspace_id=${workspace}`,
      );
      await schedule();
      fake.embedDocuments = async () => {
        throw new SearchEmbeddingError("SEARCH_PROVIDER_UNAVAILABLE", true);
      };
      await indexSearchPage(input, { provider: fake });
      expect(await state()).toMatchObject({
        status: "pending",
        last_error_code: "SEARCH_PROVIDER_UNAVAILABLE",
      });
      expect((await state()).pending_task_id).not.toBe(input.task.taskId);
    }));
  it("indexes deletion as an empty complete generation without provider calls", async () =>
    within(async () => {
      await db.execute(sql`update page set deleted_at=now() where id=${page}`);
      await schedule();
      const fake = provider();
      await indexSearchPage(input, { provider: fake });
      expect((await state()).status).toBe("ready");
      expect(fake.embedDocuments).not.toHaveBeenCalled();
    }));
});
