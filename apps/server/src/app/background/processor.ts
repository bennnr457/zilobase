import { processAiGeneration } from "../../services/ai/background";
import {
  backgroundTaskLane,
  getBackgroundCellId,
  type BackgroundTaskResult,
  type BackgroundTaskV2,
} from "../../infrastructure/background/contracts";
import { boundedErrorCode } from "../../infrastructure/background/dispatch";
import {
  recordBackgroundCounter,
  recordBackgroundHistogram,
  runBackgroundTaskSpan,
} from "../../infrastructure/background/telemetry";
import { processDatabaseAutomationRun } from "../../services/automations/execution/run-engine";
import { processDatabaseAutomationEventWindow } from "../../services/automations/triggers/event-evaluator";
import { processCalendarSyncTask } from "../../services/calendar/background";
import { processDatabaseRealtimeTask } from "../../services/databases/realtime/background";
import { processNotificationTask } from "../../services/notifications/delivery/background";
import type { RuntimeEnv } from "../../shared/config/config";
export async function processBackgroundTask(input: {
  env: RuntimeEnv;
  task: BackgroundTaskV2;
  workerId: string;
  signal?: AbortSignal;
}): Promise<BackgroundTaskResult> {
  const startedAt = Date.now();
  const attributes = {
    cell: getBackgroundCellId(input.env),
    kind: input.task.kind,
    lane: backgroundTaskLane(input.task.kind),
    outcome: "claimed",
    runtime: (input.env.ZILOBASE_RUNTIME_KIND === "worker" ? "edge" : "node") as "edge" | "node",
  };
  recordBackgroundCounter("claim", attributes);
  recordBackgroundHistogram(
    "queue_delay_ms",
    startedAt - Date.parse(input.task.availableAt),
    attributes,
  );
  try {
    const result = await runBackgroundTaskSpan(input.task, attributes, () =>
      processBackgroundTaskInner(input),
    );
    const outcomeAttributes = { ...attributes, outcome: result.outcome };
    recordBackgroundCounter(
      result.outcome === "retry"
        ? "retry"
        : result.outcome === "terminal"
          ? "terminal_failure"
          : "completion",
      outcomeAttributes,
    );
    recordBackgroundHistogram("execution_duration_ms", Date.now() - startedAt, outcomeAttributes);
    recordBackgroundHistogram(
      "time_beyond_available_at_ms",
      startedAt - Date.parse(input.task.availableAt),
      outcomeAttributes,
    );
    return result;
  } catch (error) {
    recordBackgroundCounter("retry", {
      ...attributes,
      error_code: boundedErrorCode(error),
      outcome: "error",
    });
    throw error;
  }
}

async function processBackgroundTaskInner(input: {
  env: RuntimeEnv;
  task: BackgroundTaskV2;
  workerId: string;
  signal?: AbortSignal;
}): Promise<BackgroundTaskResult> {
  const { env, task, workerId } = input;
  const handlers: Record<BackgroundTaskV2["kind"], () => Promise<BackgroundTaskResult>> = {
    "ai.generate": () =>
      processAiGeneration(env, { runId: task.resourceId, workerId, signal: input.signal }),
    "automation.event_window": () =>
      processDatabaseAutomationEventWindow(env, {
        windowId: task.resourceId,
        workerId,
      }),
    "automation.run": () => processDatabaseAutomationRun(env, { runId: task.resourceId, workerId }),
    "calendar.sync": () => processCalendarSyncTask(env, task.resourceId),
    "realtime.database": () => processDatabaseRealtimeTask(env, task.resourceId),
    "notification.publish": () => processNotificationTask(env, task.resourceId),
  };
  return handlers[task.kind]();
}
