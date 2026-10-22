import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, runWithDbEnv } from "../../infrastructure/database";
import {
  createBackgroundTask,
  type BackgroundTaskV2,
} from "../../infrastructure/background/contracts";
import { SEARCH_PROFILE } from "./vector-contracts";
import {
  admitSearchWork,
  cleanupSearchIndex,
  processSearchInvalidation,
  scanSearchWorkspace,
  scheduleSearchWorkspaceScan,
} from "./maintenance";

const url = process.env.ZILOBASE_SEARCH_TEST_DATABASE_URL;
describe.skipIf(!url)("incremental search maintenance", () => {
  let w: string;
  const env = { SEARCH_EMBEDDINGS_ENABLED: "true", ZILOBASE_CELL_ID: "search-maintenance-test" };
  const within = <T>(fn: () => Promise<T>) => runWithDbEnv({ DATABASE_URL: url }, fn);
  const task = (kind: BackgroundTaskV2["kind"], resourceId = w) =>
    createBackgroundTask({ env, kind, resourceId });
  const runScan = async () =>
    scanSearchWorkspace({ env, task: task("search.workspace_scan"), workerId: "test" });
  const seedPages = async (n: number) =>
    db.execute(
      sql`insert into page(id,workspace_id,name,created_at,updated_at) select ${w}||'-'||lpad(n::text,4,'0'),${w},'Page '||n,now(),now() from generate_series(1,${n}) n`,
    );
  beforeAll(() => {
    if (!["localhost", "127.0.0.1"].includes(new URL(url!).hostname))
      throw new Error("Isolated loopback database required");
  });
  beforeEach(async () =>
    within(async () => {
      w = randomUUID();
      await db.execute(
        sql`insert into workspace(id,name,slug) values(${w},'Maintenance test',${w})`,
      );
      await db.execute(
        sql`insert into workspace_search_settings(workspace_id,cell_id,enabled,profile_id) values(${w},${env.ZILOBASE_CELL_ID},false,${SEARCH_PROFILE.id})`,
      );
    }),
  );
  afterEach(async () =>
    within(async () => {
      await db.execute(
        sql`delete from background_dispatch where cell_id=${env.ZILOBASE_CELL_ID} and (resource_id=${w} or resource_id like ${w + "-%"} or resource_id in(select id::text from search_invalidation where workspace_id=${w}))`,
      );
      await db.execute(sql`delete from workspace where id=${w}`);
    }),
  );
  it("scans 100 pages per continuation using a captured high-water mark", async () =>
    within(async () => {
      await seedPages(201);
      await db.execute(
        sql`update workspace_search_settings set enabled=true where workspace_id=${w}`,
      );
      await scheduleSearchWorkspaceScan(env, w);
      await runScan();
      expect(
        (
          await db.execute(
            sql`select count(*)::int as n from page_search_index where workspace_id=${w}`,
          )
        ).rows[0].n,
      ).toBe(100);
      // A page created after the captured high-water mark is captured by its mutation trigger.
      await db.execute(
        sql`insert into page(id,workspace_id,name,created_at,updated_at) values(${w + "-9999"},${w},'New page',now(),now())`,
      );
      await runScan();
      await runScan();
      expect(
        (
          await db.execute(
            sql`select count(*)::int as n from page_search_index where workspace_id=${w}`,
          )
        ).rows[0].n,
      ).toBe(202);
      const s = (
        await db.execute(
          sql`select backfill_cursor,backfill_completed_at from workspace_search_settings where workspace_id=${w}`,
        )
      ).rows[0];
      expect(s.backfill_cursor).toBe(w + "-0201");
      expect(s.backfill_completed_at).not.toBeNull();
    }));
  it("recovers missing admission and expired leases without duplicating live work", async () =>
    within(async () => {
      await db.execute(
        sql`update workspace_search_settings set enabled=true,backfill_completed_at=now() where workspace_id=${w}`,
      );
      await seedPages(1);
      await db.execute(sql`update page_search_index set not_before=now() where workspace_id=${w}`);
      expect(await admitSearchWork(env, w)).toEqual({ admitted: 1 });
      expect(await admitSearchWork(env, w)).toEqual({ admitted: 0 });
      const first = (
        await db.execute(sql`select pending_task_id from page_search_index where workspace_id=${w}`)
      ).rows[0].pending_task_id;
      await db.execute(
        sql`update page_search_index set status='running',lease_owner='dead',lease_expires_at=now()-interval '1 second' where workspace_id=${w}`,
      );
      expect(await admitSearchWork(env, w)).toEqual({ admitted: 1 });
      expect(
        (
          await db.execute(
            sql`select pending_task_id from page_search_index where workspace_id=${w}`,
          )
        ).rows[0].pending_task_id,
      ).not.toBe(first);
    }));
  it("fans a property rename out through bounded cursor progress", async () =>
    within(async () => {
      await seedPages(105);
      const prop = randomUUID();
      await db.execute(
        sql`insert into page_property(id,workspace_id,name,type,created_at,updated_at) values(${prop},${w},'Old','text',now(),now())`,
      );
      await db.execute(
        sql`insert into page_property_value(id,page_id,property_id,value,created_at,updated_at) select gen_random_uuid()::text,id,${prop},'"value"'::jsonb,now(),now() from page where workspace_id=${w}`,
      );
      await db.execute(
        sql`update workspace_search_settings set enabled=true,backfill_completed_at=now() where workspace_id=${w}`,
      );
      await db.execute(sql`update page_property set name='New' where id=${prop}`);
      expect(
        (await db.execute(sql`select 1 from page_search_index where workspace_id=${w}`)).rows,
      ).toHaveLength(0);
      await admitSearchWork(env, w);
      const inv = (
        await db.execute<{ id: string; pending_task_id: string }>(
          sql`select id,pending_task_id from search_invalidation where workspace_id=${w}`,
        )
      ).rows[0];
      await processSearchInvalidation({
        env,
        task: { ...task("search.invalidate", inv.id), taskId: inv.pending_task_id },
        workerId: "test",
      });
      expect(
        (await db.execute(sql`select 1 from page_search_index where workspace_id=${w}`)).rows,
      ).toHaveLength(100);
      const next = (
        await db.execute<{ pending_task_id: string }>(
          sql`select pending_task_id from search_invalidation where id=${inv.id}::uuid`,
        )
      ).rows[0];
      expect(next.pending_task_id).not.toBe(inv.pending_task_id);
      await processSearchInvalidation({
        env,
        task: { ...task("search.invalidate", inv.id), taskId: next.pending_task_id },
        workerId: "test",
      });
      expect(
        (await db.execute(sql`select 1 from page_search_index where workspace_id=${w}`)).rows,
      ).toHaveLength(105);
      expect(
        (await db.execute(sql`select status from search_invalidation where id=${inv.id}::uuid`))
          .rows[0].status,
      ).toBe("ready");
    }));
  it("bounds concurrent admission and refills only the slots freed by completed pages", async () =>
    within(async () => {
      await db.execute(
        sql`update workspace_search_settings set enabled=true,backfill_completed_at=now() where workspace_id=${w}`,
      );
      await seedPages(18);
      await db.execute(sql`update page_search_index set not_before=now() where workspace_id=${w}`);
      await Promise.all(Array.from({ length: 8 }, () => admitSearchWork(env, w)));
      const outstanding = async () =>
        (
          await db.execute<{ n: number }>(
            sql`select count(*)::int n from page_search_index where workspace_id=${w} and status='pending' and pending_task_id is not null`,
          )
        ).rows[0].n;
      expect(await outstanding()).toBe(5);
      // Waiting for a quota window must not admit another wave of doomed calls.
      await db.execute(
        sql`update page_search_index set not_before=now()+interval '1 day' where workspace_id=${w} and pending_task_id is not null`,
      );
      expect(await admitSearchWork(env, w)).toEqual({ admitted: 0 });
      await db.execute(
        sql`update page_search_index set status='ready',indexed_revision=requested_revision,pending_task_id=null where workspace_id=${w} and page_id in (select page_id from page_search_index where workspace_id=${w} and pending_task_id is not null order by page_id limit 2)`,
      );
      expect(await admitSearchWork(env, w)).toEqual({ admitted: 2 });
      expect(await outstanding()).toBe(5);
      const other = randomUUID();
      try {
        await db.execute(
          sql`insert into workspace(id,name,slug) values(${other},'Other',${other})`,
        );
        await db.execute(
          sql`insert into workspace_search_settings(workspace_id,cell_id,enabled,profile_id,backfill_completed_at) values(${other},${env.ZILOBASE_CELL_ID},true,${SEARCH_PROFILE.id},now())`,
        );
        await db.execute(
          sql`insert into page(id,workspace_id,name,created_at,updated_at) values(${other + "-page"},${other},'Other page',now(),now())`,
        );
        await db.execute(
          sql`update page_search_index set not_before=now() where workspace_id=${other}`,
        );
        expect(await admitSearchWork(env)).toEqual({ admitted: 1 });
        expect(
          (
            await db.execute(
              sql`select pending_task_id from page_search_index where workspace_id=${other}`,
            )
          ).rows[0].pending_task_id,
        ).not.toBeNull();
        expect(await outstanding()).toBe(5);
      } finally {
        await db.execute(
          sql`delete from background_dispatch where cell_id=${env.ZILOBASE_CELL_ID} and resource_id=${other + "-page"}`,
        );
        await db.execute(sql`delete from workspace where id=${other}`);
      }
    }));
  it("keeps active and staged generations and purges disabled workspace chunks idempotently", async () =>
    within(async () => {
      await seedPages(1);
      const generation = randomUUID();
      await db.execute(
        sql`update workspace_search_settings set enabled=true,backfill_completed_at=now() where workspace_id=${w}`,
      );
      await db.execute(sql`select zilobase_request_page_index(${w},${w + "-0001"})`);
      await db.execute(
        sql`update page_search_index set staged_generation_id=${generation}::uuid where workspace_id=${w}`,
      );
      for (const [active, gen, position] of [
        [true, randomUUID(), 0],
        [false, generation, 1],
        [false, randomUUID(), 2],
      ] as const)
        await db.execute(
          sql`insert into search_chunk(workspace_id,page_id,profile_id,index_epoch,generation_id,source_revision,chunk_kind,source_key,chunk_index,content_markdown,embedding_input_hash,embedding,is_active,byte_count,created_at) values(${w},${w + "-0001"},${SEARCH_PROFILE.id},1,${gen}::uuid,1,'body','body',${position},'content','hash',array_fill(1::real,array[1536])::vector,${active},7,now()-interval '2 days')`,
        );
      expect((await cleanupSearchIndex(env)).deletedChunks).toBe(1);
      expect((await cleanupSearchIndex(env)).deletedChunks).toBe(0);
      await db.execute(
        sql`update workspace_search_settings set enabled=false,index_epoch=index_epoch+1 where workspace_id=${w}`,
      );
      expect((await cleanupSearchIndex(env)).deletedChunks).toBe(2);
      expect((await cleanupSearchIndex(env)).deletedChunks).toBe(0);
    }));
  it("respects disabled deployments and workspace cells", async () =>
    within(async () => {
      await db.execute(
        sql`update workspace_search_settings set enabled=true where workspace_id=${w}`,
      );
      await seedPages(1);
      expect(await admitSearchWork({ ...env, SEARCH_EMBEDDINGS_ENABLED: "false" }, w)).toEqual({
        admitted: 0,
      });
      expect(await admitSearchWork({ ...env, ZILOBASE_CELL_ID: "different" }, w)).toEqual({
        admitted: 0,
      });
    }));
});
