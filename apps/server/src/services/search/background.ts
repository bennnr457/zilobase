import { scanSearchWorkspace, processSearchInvalidation } from "./maintenance";
import { indexSearchPage } from "./indexing";
import { sql } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import type {
  BackgroundTaskResult,
  BackgroundTaskV2,
} from "../../infrastructure/background/contracts";
import type { RuntimeEnv } from "../../shared/config/config";

export async function processSearchTask(input: {
  env: RuntimeEnv;
  task: BackgroundTaskV2;
  workerId: string;
  signal?: AbortSignal;
}): Promise<BackgroundTaskResult> {
  if (input.env.SEARCH_EMBEDDINGS_ENABLED !== "true") return { outcome: "noop" };
  if (input.task.kind === "search.page_index") return indexSearchPage(input);
  if (input.task.kind === "search.workspace_scan") return scanSearchWorkspace(input);
  if (input.task.kind === "search.invalidate") return processSearchInvalidation(input);
  throw new Error("SEARCH_TASK_KIND_INVALID");
}

export async function failSearchDelivery(taskId: string) {
  // A superseded task must not fail the newer request for the same page.
  await db.execute(
    sql`update page_search_index set status='failed',last_error_code='TRANSPORT_RETRIES_EXHAUSTED',pending_task_id=null,lease_owner=null,lease_expires_at=null,updated_at=now() where pending_task_id=${taskId}::uuid`,
  );
  await db.execute(
    sql`update search_invalidation set status='failed',last_error_code='TRANSPORT_RETRIES_EXHAUSTED',pending_task_id=null,lease_owner=null,lease_expires_at=null,updated_at=now() where pending_task_id=${taskId}::uuid`,
  );
  await db.execute(
    sql`update workspace_search_settings s set last_error_code='TRANSPORT_RETRIES_EXHAUSTED' from background_dispatch d where d.id=${taskId} and d.kind='search.workspace_scan' and d.resource_id=s.workspace_id and d.cell_id=s.cell_id and d.created_at>=coalesce(s.enabled_at,'-infinity'::timestamptz) and s.backfill_completed_at is null`,
  );
  return true;
}
