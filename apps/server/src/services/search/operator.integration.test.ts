import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { db, runWithDbEnv } from "../../infrastructure/database";
import { createBackgroundTask } from "../../infrastructure/background/contracts";
import { persistBackgroundTasks } from "../../infrastructure/background/publication";
import { replayBackgroundFailure } from "../../app/background/operations/replay";
import { renderPrometheusBackgroundMetrics } from "../../infrastructure/background/telemetry";
import { searchCounter, searchHistogram } from "./metrics";
import { runSearchOperator } from "./operator";
import { SEARCH_PROFILE } from "./vector-contracts";
const url = process.env.ZILOBASE_SEARCH_TEST_DATABASE_URL;
describe.skipIf(!url)("search operator scope and recovery", () => {
  const env = { ZILOBASE_CELL_ID: "search-operator-test", SEARCH_EMBEDDINGS_ENABLED: "true" };
  const within = <T>(work: () => Promise<T>) => runWithDbEnv({ DATABASE_URL: url }, work);
  let w: string, p: string;
  const op = (command: Parameters<typeof runSearchOperator>[1]["command"], extra = {}) =>
    runSearchOperator(env, { command, cell: env.ZILOBASE_CELL_ID, workspaceId: w, ...extra });
  beforeEach(async () =>
    within(async () => {
      if (!["localhost", "127.0.0.1"].includes(new URL(url!).hostname))
        throw new Error("Isolated loopback database required");
      w = randomUUID();
      p = `${w}-page`;
      await db.execute(
        sql`insert into workspace(id,name,slug) values(${w},'Operator fixture',${w})`,
      );
      await db.execute(
        sql`insert into workspace_search_settings(workspace_id,cell_id,enabled,profile_id,backfill_completed_at) values(${w},${env.ZILOBASE_CELL_ID},true,${SEARCH_PROFILE.id},now())`,
      );
      await db.execute(
        sql`insert into page(id,workspace_id,name,created_at,updated_at) values(${p},${w},'Private content sentinel',now(),now())`,
      );
    }),
  );
  afterEach(async () =>
    within(async () => {
      await db.execute(
        sql`delete from background_dispatch where cell_id=${env.ZILOBASE_CELL_ID} and resource_id in (${w},${p})`,
      );
      await db.execute(sql`delete from workspace where id=${w}`);
    }),
  );
  it("reports identifiers and health without content, and rejects cross-cell operations", async () =>
    within(async () => {
      const status = await op("status");
      expect(JSON.stringify(status)).toContain(w);
      expect(JSON.stringify(status)).not.toContain("Private content sentinel");
      await expect(op("reindex", { cell: "wrong" })).rejects.toThrow("OPERATIONS_CELL_MISMATCH");
      await db.execute(
        sql`update workspace_search_settings set cell_id='other-cell' where workspace_id=${w}`,
      );
      await expect(op("cleanup")).rejects.toThrow("SEARCH_WORKSPACE_CELL_MISMATCH");
    }));
  it("retries transient failures only and preserves workspace disablement", async () =>
    within(async () => {
      await db.execute(
        sql`update page_search_index set status='failed',last_error_code='SEARCH_PROVIDER_VECTOR_INVALID' where workspace_id=${w}`,
      );
      expect(((await op("retry")) as { retried: number }).retried).toBe(0);
      await db.execute(
        sql`update page_search_index set last_error_code='SEARCH_PROVIDER_UNAVAILABLE' where workspace_id=${w}`,
      );
      expect(((await op("retry")) as { retried: number }).retried).toBe(1);
      await db.execute(
        sql`update page_search_index set status='failed',last_error_code='TRANSPORT_RETRIES_EXHAUSTED',pending_task_id=null where workspace_id=${w}`,
      );
      await db.execute(
        sql`update workspace_search_settings set enabled=false where workspace_id=${w}`,
      );
      expect(((await op("retry")) as { retried: number }).retried).toBe(0);
      await expect(op("reindex")).rejects.toThrow("SEARCH_WORKSPACE_DISABLED");
    }));
  it("generic finalized replay reconnects the new durable task and rejects duplicate replay", async () =>
    within(async () => {
      const task = createBackgroundTask({ env, kind: "search.page_index", resourceId: p });
      await persistBackgroundTasks(env, [task]);
      await db.execute(
        sql`update background_dispatch set status='exhausted',failure_handled_at=now() where id=${task.taskId}`,
      );
      await db.execute(
        sql`update page_search_index set status='failed',last_error_code='TRANSPORT_RETRIES_EXHAUSTED',pending_task_id=null where workspace_id=${w}`,
      );
      const next = await replayBackgroundFailure(env, task.taskId);
      expect(
        (
          await db.execute(
            sql`select pending_task_id::text from page_search_index where workspace_id=${w}`,
          )
        ).rows[0].pending_task_id,
      ).toBe(next.taskId);
      await expect(replayBackgroundFailure(env, task.taskId)).rejects.toThrow(
        "SEARCH_REPLAY_NOT_ELIGIBLE",
      );
    }));
  it("reindex fences prior work and schedules an incremental scan", async () =>
    within(async () => {
      await op("reindex");
      const state = (
        await db.execute(
          sql`select index_epoch::text,backfill_high_water,backfill_completed_at from workspace_search_settings where workspace_id=${w}`,
        )
      ).rows[0];
      expect(state.index_epoch).toBe("2");
      expect(state.backfill_high_water).toBe(p);
      expect(state.backfill_completed_at).toBeNull();
      expect(
        (
          await db.execute(
            sql`select kind from background_dispatch where cell_id=${env.ZILOBASE_CELL_ID} and resource_id=${w}`,
          )
        ).rows[0].kind,
      ).toBe("search.workspace_scan");
    }));
  it("renders bounded metrics without source/query or secret labels", () => {
    searchCounter(env, "cache", "hit");
    searchCounter(env, "reserved_tokens", "index", 123);
    searchHistogram(env, "provider_ms", "completed", 15);
    const metrics = renderPrometheusBackgroundMetrics();
    expect(metrics).toContain("zilobase_background_search_cache");
    expect(metrics).toContain('outcome="hit"');
    expect(metrics).not.toContain("Private content sentinel");
    expect(metrics).not.toContain("GEMINI_API_KEY");
  });
});
