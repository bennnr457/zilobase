import { sql } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import {
  createBackgroundTask,
  getBackgroundCellId,
  type BackgroundTaskResult,
} from "../../infrastructure/background/contracts";
import { persistBackgroundTasks } from "../../infrastructure/background/publication";
import type { RuntimeEnv } from "../../shared/config/config";
import type { SearchTaskInput } from "./indexing";

export async function scheduleSearchWorkspaceScan(env: RuntimeEnv, workspaceId: string) {
  return db.transaction(async (tx) => {
    const row = (
      await tx.execute(
        sql`update workspace_search_settings s set backfill_cursor=null,backfill_high_water=(select max(p.id) from page p where p.workspace_id=s.workspace_id),backfill_completed_at=null,last_error_code=null,updated_at=now() where s.workspace_id=${workspaceId} and s.cell_id=${getBackgroundCellId(env)} and s.enabled returning s.workspace_id`,
      )
    ).rows[0];
    if (!row) return;
    const task = createBackgroundTask({
      env,
      kind: "search.workspace_scan",
      resourceId: workspaceId,
    });
    await persistBackgroundTasks(env, [task], tx, `search:${task.taskId}`);
  });
}

export async function scanSearchWorkspace(input: SearchTaskInput): Promise<BackgroundTaskResult> {
  await db.transaction(async (tx) => {
    const s = (
      await tx.execute<{
        workspace_id: string;
        backfill_cursor: string | null;
        backfill_high_water: string | null;
      }>(
        sql`select * from workspace_search_settings where workspace_id=${input.task.resourceId} and cell_id=${getBackgroundCellId(input.env)} and enabled and backfill_completed_at is null for update`,
      )
    ).rows[0];
    if (!s) return;
    const pages = (
      await tx.execute<{ id: string }>(
        sql`select id from page where workspace_id=${s.workspace_id} and (${s.backfill_cursor}::text is null or id>${s.backfill_cursor}) and id<=${s.backfill_high_water} order by id limit 100`,
      )
    ).rows;
    if (pages.length) {
      // One set-based statement invokes the same transactional dirty-state function as writes.
      await tx.execute(
        sql`select zilobase_request_page_index(${s.workspace_id},id) from page where workspace_id=${s.workspace_id} and id in (select jsonb_array_elements_text(${JSON.stringify(pages.map((p) => p.id))}::jsonb))`,
      );
    }
    await tx.execute(
      sql`update workspace_search_settings set backfill_cursor=${pages.at(-1)?.id ?? s.backfill_cursor},backfill_completed_at=case when ${pages.length}<100 then now() else null end,updated_at=now() where workspace_id=${s.workspace_id}`,
    );
    if (pages.length === 100) {
      const next = createBackgroundTask({
        env: input.env,
        kind: "search.workspace_scan",
        resourceId: s.workspace_id,
      });
      await persistBackgroundTasks(input.env, [next], tx, `search:${next.taskId}`);
    }
  });
  return { outcome: "completed" };
}

export async function processSearchInvalidation(
  input: SearchTaskInput,
): Promise<BackgroundTaskResult> {
  let unsupported = false;
  await db.transaction(async (tx) => {
    const row = (
      await tx.execute<{
        id: string;
        workspace_id: string;
        kind: string;
        resource_id: string;
        cursor: string | null;
      }>(
        sql`select inv.* from search_invalidation inv join workspace_search_settings s on s.workspace_id=inv.workspace_id where inv.id=${input.task.resourceId}::uuid and inv.pending_task_id=${input.task.taskId}::uuid and inv.status='pending' and s.cell_id=${getBackgroundCellId(input.env)} and s.enabled for update of inv,s`,
      )
    ).rows[0];
    if (!row) return;
    if (!["property", "data_source"].includes(row.kind)) {
      unsupported = true;
      await tx.execute(
        sql`update search_invalidation set status='failed',last_error_code='SEARCH_INVALIDATION_UNSUPPORTED',pending_task_id=null where id=${row.id}::uuid`,
      );
      return;
    }
    const predicate =
      row.kind === "property"
        ? sql`exists(select 1 from page_property_value v where v.page_id=p.id and v.property_id=${row.resource_id})`
        : sql`exists(select 1 from database_row r where r.page_id=p.id and r.data_source_id=${row.resource_id})`;
    const pages = (
      await tx.execute<{ id: string }>(
        sql`select p.id from page p where p.workspace_id=${row.workspace_id} and (${row.cursor}::text is null or p.id>${row.cursor}) and ${predicate} order by p.id limit 100`,
      )
    ).rows;
    if (pages.length)
      await tx.execute(
        sql`select zilobase_request_page_index(${row.workspace_id},p.id) from page p where p.workspace_id=${row.workspace_id} and p.id in(select jsonb_array_elements_text(${JSON.stringify(pages.map((p) => p.id))}::jsonb))`,
      );
    const next =
      pages.length === 100
        ? createBackgroundTask({ env: input.env, kind: "search.invalidate", resourceId: row.id })
        : null;
    if (next) await persistBackgroundTasks(input.env, [next], tx, `search:${next.taskId}`);
    await tx.execute(
      sql`update search_invalidation set cursor=${pages.at(-1)?.id ?? row.cursor},status=${next ? "pending" : "ready"},pending_task_id=${next?.taskId ?? null}::uuid,lease_fence=lease_fence+1,lease_owner=null,lease_expires_at=null,last_error_code=null,updated_at=now() where id=${row.id}::uuid`,
    );
  });
  return unsupported
    ? { outcome: "terminal", errorCode: "SEARCH_INVALIDATION_UNSUPPORTED" }
    : { outcome: "completed" };
}

export async function admitSearchWork(env: RuntimeEnv, workspaceId?: string) {
  if (env.SEARCH_EMBEDDINGS_ENABLED !== "true") return { admitted: 0 };
  return db.transaction(async (tx) => {
    // Settings timestamps rotate admission across workspaces. Edits sort before scan-only work.
    const workspaces = (
      await tx.execute<{
        workspace_id: string;
      }>(sql`select s.workspace_id from workspace_search_settings s where s.enabled and s.cell_id=${getBackgroundCellId(env)} and (${workspaceId ?? null}::text is null or s.workspace_id=${workspaceId ?? null}) and (
      exists(select 1 from page_search_index i where i.workspace_id=s.workspace_id and i.status in ('pending','running') and i.requested_revision>i.indexed_revision and i.not_before<=now()+interval '30 seconds') or
      exists(select 1 from search_invalidation inv where inv.workspace_id=s.workspace_id and inv.status='pending') or s.backfill_completed_at is null)
      order by s.updated_at,s.workspace_id limit 20 for update of s skip locked`)
    ).rows;
    let admitted = 0;
    for (const w of workspaces) {
      const pages = (
        await tx.execute<{
          page_id: string;
          not_before: string;
        }>(sql`select i.page_id,i.not_before::text from page_search_index i join workspace_search_settings s on s.workspace_id=i.workspace_id
        where i.workspace_id=${w.workspace_id} and i.index_epoch=s.index_epoch and i.profile_id=s.profile_id and i.status in ('pending','running') and i.requested_revision>i.indexed_revision and i.not_before<=now()+interval '30 seconds'
        and (i.lease_expires_at is null or i.lease_expires_at<=now()) and (i.pending_task_id is null or not exists(select 1 from background_dispatch d where d.id=i.pending_task_id::text and d.status in ('pending','published','running')) or i.status='running' and i.lease_expires_at<=now())
        order by i.first_dirty_at,i.page_id limit 5 for update of i skip locked`)
      ).rows;
      for (const p of pages) {
        const task = createBackgroundTask({
          env,
          kind: "search.page_index",
          resourceId: p.page_id,
          availableAt: new Date(p.not_before),
        });
        await persistBackgroundTasks(env, [task], tx, `search:${task.taskId}`);
        await tx.execute(
          sql`update page_search_index set status='pending',pending_task_id=${task.taskId}::uuid,lease_owner=null,lease_expires_at=null,updated_at=now() where workspace_id=${w.workspace_id} and page_id=${p.page_id}`,
        );
        admitted++;
      }
      const invalidations = (
        await tx.execute<{ id: string }>(
          sql`select id from search_invalidation inv where inv.workspace_id=${w.workspace_id} and inv.status='pending' and (inv.pending_task_id is null or not exists(select 1 from background_dispatch d where d.id=inv.pending_task_id::text and d.status in ('pending','published','running'))) order by inv.created_at limit 5 for update skip locked`,
        )
      ).rows;
      for (const inv of invalidations) {
        const task = createBackgroundTask({ env, kind: "search.invalidate", resourceId: inv.id });
        await persistBackgroundTasks(env, [task], tx, `search:${task.taskId}`);
        await tx.execute(
          sql`update search_invalidation set pending_task_id=${task.taskId}::uuid where id=${inv.id}::uuid`,
        );
        admitted++;
      }
      const pendingScan = (
        await tx.execute(
          sql`select 1 from background_dispatch where cell_id=${getBackgroundCellId(env)} and kind='search.workspace_scan' and resource_id=${w.workspace_id} and status in ('pending','published','running') limit 1`,
        )
      ).rows.length;
      if (!pendingScan) {
        const s = (
          await tx.execute(
            sql`select 1 from workspace_search_settings where workspace_id=${w.workspace_id} and backfill_completed_at is null and last_error_code is null`,
          )
        ).rows.length;
        if (s) {
          const task = createBackgroundTask({
            env,
            kind: "search.workspace_scan",
            resourceId: w.workspace_id,
          });
          await persistBackgroundTasks(env, [task], tx, `search:${task.taskId}`);
          admitted++;
        }
      }
      await tx.execute(
        sql`update workspace_search_settings set updated_at=clock_timestamp() where workspace_id=${w.workspace_id}`,
      );
    }
    return { admitted };
  });
}

export async function cleanupSearchIndex(env: RuntimeEnv) {
  const cell = getBackgroundCellId(env);
  // Keep inactive complete generations for one day to support reuse. Never delete current staging.
  const chunks = await db.execute(sql`with doomed as (
    select c.workspace_id,c.id from search_chunk c join workspace_search_settings s on s.workspace_id=c.workspace_id left join page_search_index i on i.workspace_id=c.workspace_id and i.page_id=c.page_id and i.profile_id=c.profile_id
    where s.cell_id=${cell} and (not s.enabled or c.index_epoch<>s.index_epoch or not c.is_active and c.created_at<now()-interval '1 day' and c.generation_id is distinct from i.staged_generation_id) limit 500)
    delete from search_chunk c using doomed d where c.workspace_id=d.workspace_id and c.id=d.id returning c.id`);
  await db.execute(
    sql`with doomed as(select c.workspace_id,c.user_id,c.profile_id,c.purpose,c.input_hash from search_query_embedding_cache c join workspace_search_settings s on s.workspace_id=c.workspace_id where s.cell_id=${cell} and (not s.enabled or c.expires_at<=now()) limit 500) delete from search_query_embedding_cache c using doomed d where (c.workspace_id,c.user_id,c.profile_id,c.purpose,c.input_hash)=(d.workspace_id,d.user_id,d.profile_id,d.purpose,d.input_hash)`,
  );
  await db.execute(
    sql`with doomed as(select quota_scope,bucket_scope,window_start,window_kind,traffic_class from search_embedding_usage_bucket where window_kind<>'cooldown' and window_start<now()-interval '2 days' or window_kind='cooldown' and cooldown_until<now() limit 500) delete from search_embedding_usage_bucket b using doomed d where (b.quota_scope,b.bucket_scope,b.window_start,b.window_kind,b.traffic_class)=(d.quota_scope,d.bucket_scope,d.window_start,d.window_kind,d.traffic_class)`,
  );
  await db.execute(
    sql`with doomed as(select inv.id from search_invalidation inv join workspace_search_settings s on s.workspace_id=inv.workspace_id where s.cell_id=${cell} and (not s.enabled or inv.status='ready' and inv.updated_at<now()-interval '1 day') limit 500) delete from search_invalidation inv using doomed d where inv.id=d.id`,
  );
  return { deletedChunks: chunks.rows.length };
}

export async function maintainSearchIndex(env: RuntimeEnv) {
  const admission = await admitSearchWork(env);
  const cleanup = await cleanupSearchIndex(env);
  return { ...admission, ...cleanup };
}
