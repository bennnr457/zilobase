import { sql } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import type {
  BackgroundTaskResult,
  BackgroundTaskV2,
} from "../../infrastructure/background/contracts";
import type { RuntimeEnv } from "../../shared/config/config";

// Admission stays disabled until the resumable indexing and maintenance handlers are installed.
export async function processSearchTask(input: {
  env: RuntimeEnv;
  task: BackgroundTaskV2;
  workerId: string;
  signal?: AbortSignal;
}): Promise<BackgroundTaskResult> {
  if (input.env.SEARCH_EMBEDDINGS_ENABLED !== "true") return { outcome: "noop" };
  throw new Error("SEARCH_HANDLER_UNAVAILABLE");
}

export async function failSearchDelivery(taskId: string) {
  // A superseded task must not fail the newer request for the same page.
  await db.execute(
    sql`update page_search_index set status='failed',last_error_code='TRANSPORT_RETRIES_EXHAUSTED',pending_task_id=null,lease_owner=null,lease_expires_at=null,updated_at=now() where pending_task_id=${taskId}::uuid`,
  );
  await db.execute(
    sql`update search_invalidation set status='failed',last_error_code='TRANSPORT_RETRIES_EXHAUSTED',pending_task_id=null,lease_owner=null,lease_expires_at=null,updated_at=now() where pending_task_id=${taskId}::uuid`,
  );
  return true;
}
