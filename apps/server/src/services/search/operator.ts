import { sql } from "drizzle-orm";
import { db, runWithDb, type Database } from "../../infrastructure/database";
import {
  getBackgroundCellId,
  type BackgroundTaskV2,
} from "../../infrastructure/background/contracts";
import type { RuntimeEnv } from "../../shared/config/config";
import { admitSearchWork, cleanupSearchIndex, scheduleSearchWorkspaceScan } from "./maintenance";
import { searchQuotaScope } from "./embedding-usage";

const retryable = [
  "TRANSPORT_RETRIES_EXHAUSTED",
  "SEARCH_INTERRUPTED",
  "SEARCH_INDEX_FAILED",
  "SEARCH_PROVIDER_TIMEOUT",
  "SEARCH_PROVIDER_UNAVAILABLE",
  "SEARCH_PROVIDER_RATE_LIMIT",
];
export async function prepareSearchReplay(
  env: RuntimeEnv,
  task: BackgroundTaskV2,
  nextTaskId: string,
) {
  if (env.SEARCH_EMBEDDINGS_ENABLED !== "true") throw new Error("SEARCH_DEPLOYMENT_DISABLED");
  const cell = getBackgroundCellId(env);
  let rows: unknown[] | undefined;
  if (task.kind === "search.page_index") {
    rows = (
      await db.execute(
        sql`update page_search_index i set status='pending',pending_task_id=${nextTaskId}::uuid,not_before=now(),lease_owner=null,lease_expires_at=null,last_error_code=null,consecutive_failures=0,updated_at=now() from workspace_search_settings s where s.workspace_id=i.workspace_id and s.cell_id=${cell} and s.enabled and s.profile_id=i.profile_id and s.index_epoch=i.index_epoch and i.page_id=${task.resourceId} and i.status='failed' and i.requested_revision>i.indexed_revision and i.last_error_code in (${sql.join(
          retryable.map((x) => sql`${x}`),
          sql`,`,
        )}) returning i.page_id`,
      )
    ).rows;
  } else if (task.kind === "search.invalidate") {
    rows = (
      await db.execute(
        sql`update search_invalidation i set status='pending',pending_task_id=${nextTaskId}::uuid,last_error_code=null,updated_at=now() from workspace_search_settings s where s.workspace_id=i.workspace_id and s.cell_id=${cell} and s.enabled and i.id=${task.resourceId}::uuid and i.status='failed' and i.last_error_code='TRANSPORT_RETRIES_EXHAUSTED' returning i.id`,
      )
    ).rows;
  } else if (task.kind === "search.workspace_scan") {
    rows = (
      await db.execute(
        sql`update workspace_search_settings set last_error_code=null where workspace_id=${task.resourceId} and cell_id=${cell} and enabled and backfill_completed_at is null and last_error_code='TRANSPORT_RETRIES_EXHAUSTED' returning workspace_id`,
      )
    ).rows;
  }
  if (!rows?.length) throw new Error("SEARCH_REPLAY_NOT_ELIGIBLE");
}
export type SearchOperatorCommand =
  | "status"
  | "backfill"
  | "retry"
  | "reindex"
  | "repair"
  | "cleanup";
export async function runSearchOperator(
  env: RuntimeEnv,
  input: { command: SearchOperatorCommand; cell: string; workspaceId?: string },
) {
  const cell = getBackgroundCellId(env);
  if (!input.cell || input.cell !== cell) throw new Error("OPERATIONS_CELL_MISMATCH");
  const w = input.workspaceId;
  if (
    w &&
    !(
      await db.execute(
        sql`select 1 from workspace_search_settings where workspace_id=${w} and cell_id=${cell}`,
      )
    ).rows.length
  )
    throw new Error("SEARCH_WORKSPACE_CELL_MISMATCH");
  if (input.command === "status") {
    const workspaces = (
      await db.execute(
        sql`select s.workspace_id,s.enabled,s.index_epoch::text,s.backfill_completed_at,s.last_error_code,count(i.page_id) filter(where i.status='pending')::int as pending,count(i.page_id) filter(where i.status='running')::int as running,count(i.page_id) filter(where i.status='ready')::int as ready,count(i.page_id) filter(where i.status='failed')::int as failed,count(i.page_id) filter(where i.status='running' and i.lease_expires_at<=now())::int as expired_leases,min(i.first_dirty_at) filter(where i.indexed_revision<i.requested_revision) as oldest_dirty_at,max(i.last_indexed_at) as last_indexed_at from workspace_search_settings s left join page_search_index i on i.workspace_id=s.workspace_id and i.profile_id=s.profile_id and i.index_epoch=s.index_epoch where s.cell_id=${cell} and (${w ?? null}::text is null or s.workspace_id=${w ?? null}) group by s.workspace_id order by s.workspace_id limit 100`,
      )
    ).rows;
    const delivery = (
      await db.execute(
        sql`select d.status,count(*)::int as count,min(d.available_at) as oldest_available_at from background_dispatch d where d.cell_id=${cell} and d.kind in ('search.page_index','search.workspace_scan','search.invalidate') and (${w ?? null}::text is null or d.resource_id=${w ?? null} or exists(select 1 from page p where p.id=d.resource_id and p.workspace_id=${w ?? null}) or exists(select 1 from search_invalidation i where i.id::text=d.resource_id and i.workspace_id=${w ?? null})) group by d.status`,
      )
    ).rows;
    const cooldown =
      (
        await db.execute(
          sql`select max(cooldown_until) as until from search_embedding_usage_bucket where quota_scope=${searchQuotaScope(env)} and window_kind='cooldown' and cooldown_until>now()`,
        )
      ).rows[0]?.until ?? null;
    const maintenance = (
      await db.execute(
        sql`select last_succeeded_at,last_failed_at,next_run_at,lease_expires_at,last_error_code from background_maintenance_task where task_key='search.index'`,
      )
    ).rows;
    return { cell, workspaces, delivery, cooldown, maintenance, workspaceLimit: 100 };
  }
  if (input.command === "cleanup") return cleanupSearchIndex(env, w);
  if (env.SEARCH_EMBEDDINGS_ENABLED !== "true") throw new Error("SEARCH_DEPLOYMENT_DISABLED");
  if (input.command === "backfill" || input.command === "reindex") {
    if (!w) throw new Error("SEARCH_WORKSPACE_REQUIRED");
    await db.transaction(async (tx) =>
      runWithDb(tx as unknown as Database, async () => {
        const rows = (
          await db.execute(
            sql`select 1 from workspace_search_settings where workspace_id=${w} and cell_id=${cell} and enabled for update`,
          )
        ).rows;
        if (!rows.length) throw new Error("SEARCH_WORKSPACE_DISABLED");
        if (input.command === "reindex")
          await db.execute(
            sql`update workspace_search_settings set index_epoch=index_epoch+1 where workspace_id=${w}`,
          );
        await scheduleSearchWorkspaceScan(env, w);
      }),
    );
  }
  let retried = 0;
  if (input.command === "retry") {
    retried = await db.transaction(async (tx) => {
      const rows = (
        await tx.execute(
          sql`with retry as(select i.workspace_id,i.page_id,i.profile_id from page_search_index i join workspace_search_settings s on s.workspace_id=i.workspace_id where s.cell_id=${cell} and s.enabled and i.profile_id=s.profile_id and i.index_epoch=s.index_epoch and (${w ?? null}::text is null or i.workspace_id=${w ?? null}) and i.status='failed' and i.last_error_code in (${sql.join(
            retryable.map((x) => sql`${x}`),
            sql`,`,
          )}) order by i.updated_at limit 100 for update of i skip locked) update page_search_index i set status='pending',pending_task_id=null,not_before=now(),lease_owner=null,lease_expires_at=null,last_error_code=null,consecutive_failures=0 from retry r where (i.workspace_id,i.page_id,i.profile_id)=(r.workspace_id,r.page_id,r.profile_id) returning i.page_id`,
        )
      ).rows;
      await tx.execute(
        sql`with retry as(select i.id from search_invalidation i join workspace_search_settings s on s.workspace_id=i.workspace_id where s.cell_id=${cell} and s.enabled and (${w ?? null}::text is null or s.workspace_id=${w ?? null}) and i.status='failed' and i.last_error_code='TRANSPORT_RETRIES_EXHAUSTED' limit 100 for update of i skip locked) update search_invalidation i set status='pending',pending_task_id=null,last_error_code=null from retry r where i.id=r.id`,
      );
      return rows.length;
    });
  }
  return { retried, ...(await admitSearchWork(env, w)), publication: "maintenance" };
}
