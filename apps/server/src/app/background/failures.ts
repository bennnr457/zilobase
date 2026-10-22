import { failSearchDelivery } from "../../services/search/background";
import { failChatRunDelivery } from "../../services/ai/runs";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  backgroundTaskLane,
  getBackgroundCellId,
  type BackgroundLane,
} from "../../infrastructure/background/contracts";
import { backgroundTransaction } from "../../infrastructure/background/publication";
import { decodeBackgroundTaskV2 } from "../../infrastructure/background/task-v2";
import { db } from "../../infrastructure/database";
import { backgroundDispatch } from "../../infrastructure/database/schema";
import { failAutomationDelivery } from "../../services/automations/execution/delivery-failure";
import { failCalendarDelivery } from "../../services/calendar/delivery-failure";
import { failDatabaseRealtimeDelivery } from "../../services/databases/realtime/background";
import { failNotificationDelivery } from "../../services/notifications/delivery/background";
import type { RuntimeEnv } from "../../shared/config/config";

export async function recordBackgroundExhaustion(
  env: RuntimeEnv,
  body: unknown,
  lane: BackgroundLane,
) {
  const task = decodeBackgroundTaskV2(body, getBackgroundCellId(env));
  if (backgroundTaskLane(task.kind) !== lane) throw new Error("BACKGROUND_TASK_LANE_MISMATCH");
  const [persisted] = await db
    .select()
    .from(backgroundDispatch)
    .where(and(eq(backgroundDispatch.id, task.taskId), eq(backgroundDispatch.cellId, task.cellId)))
    .limit(1);
  if (!persisted) throw new Error("BACKGROUND_TASK_NOT_ADMITTED");
  if (
    Object.entries(task).some(([key, value]) => value !== persisted.task[key as keyof typeof task])
  )
    throw new Error("BACKGROUND_TASK_PERSISTED_MISMATCH");
  if (["completed", "terminal", "cancelled", "exhausted"].includes(persisted.status)) return;
  await backgroundTransaction(env, async (tx) => {
    const [row] = await tx
      .select()
      .from(backgroundDispatch)
      .where(
        and(eq(backgroundDispatch.id, task.taskId), eq(backgroundDispatch.cellId, task.cellId)),
      )
      .for("update");
    if (!row) throw new Error("BACKGROUND_TASK_NOT_ADMITTED");
    if (Object.entries(task).some(([key, value]) => value !== row.task[key as keyof typeof task]))
      throw new Error("BACKGROUND_TASK_PERSISTED_MISMATCH");
    if (["completed", "terminal", "cancelled"].includes(row.status)) return;
    await tx
      .update(backgroundDispatch)
      .set({
        status: "exhausted",
        errorCode: "TRANSPORT_RETRIES_EXHAUSTED",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(backgroundDispatch.id, row.id));
  });
  await reconcileBackgroundFailures(env);
}

export async function reconcileBackgroundFailures(env: RuntimeEnv) {
  // One locked dispatch record and its feature failure update commit together.
  return backgroundTransaction(env, async (tx) => {
    const rows = await tx
      .select()
      .from(backgroundDispatch)
      .where(
        and(
          eq(backgroundDispatch.cellId, getBackgroundCellId(env)),
          eq(backgroundDispatch.status, "exhausted"),
          isNull(backgroundDispatch.failureHandledAt),
          or(
            isNull(backgroundDispatch.leaseExpiresAt),
            lte(backgroundDispatch.leaseExpiresAt, sql`current_timestamp`),
          ),
        ),
      )
      .orderBy(asc(backgroundDispatch.completedAt))
      .limit(100)
      .for("update", { skipLocked: true });
    for (const row of rows) {
      let handled: boolean;
      switch (row.task.kind) {
        case "search.page_index":
        case "search.workspace_scan":
        case "search.invalidate":
          handled = await failSearchDelivery(row.id);
          break;
        case "ai.generate":
          handled = await failChatRunDelivery(row.resourceId);
          break;
        case "automation.run":
          handled = await failAutomationDelivery(row.resourceId, false);
          break;
        case "automation.event_window":
          handled = await failAutomationDelivery(row.resourceId, true);
          break;
        case "calendar.sync":
          handled = await failCalendarDelivery(row.resourceId, row.task.availableAt);
          break;
        case "realtime.database":
          handled = await failDatabaseRealtimeDelivery(row.resourceId);
          break;
        case "notification.publish":
          handled = await failNotificationDelivery(row.resourceId);
          break;
      }
      if (handled)
        await tx
          .update(backgroundDispatch)
          .set({ failureHandledAt: new Date(), leaseOwner: null, leaseExpiresAt: null })
          .where(
            and(eq(backgroundDispatch.id, row.id), eq(backgroundDispatch.status, "exhausted")),
          );
    }
    return { examined: rows.length };
  });
}
