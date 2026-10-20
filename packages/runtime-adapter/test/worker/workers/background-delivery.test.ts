import { createMessageBatch, createExecutionContext, getQueueResult } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createBackgroundWorker } from "../../../src/worker/background-worker";
import { backgroundFixture } from "./server-adapter-api";
import {
  BACKGROUND_TASK_KINDS,
  createBackgroundTaskV2,
} from "../../../../../apps/server/src/infrastructure/background/task-v2";
import { backgroundTaskLane } from "../../../../../apps/server/src/infrastructure/background/contracts";
const queues = {
  fast: "zilobase-background-fast",
  automation: "zilobase-automation-runs",
  calendar: "zilobase-calendar-jobs",
  ai: "zilobase-ai-runs",
};
const worker = createBackgroundWorker();
const env = { ZILOBASE_CELL_ID: "fixture" };
async function deliver(body: unknown, queue = "zilobase-background-fast", attempts = 1) {
  const batch = createMessageBatch(queue, [
    { id: "message", timestamp: new Date(), attempts, body },
  ]);
  await worker.queue(batch, env);
  return getQueueResult(batch, createExecutionContext());
}
beforeEach(() => {
  backgroundFixture.completed.clear();
  backgroundFixture.rescheduled.length = 0;
  backgroundFixture.exhausted.length = 0;
  backgroundFixture.executed.length = 0;
});
describe("Miniflare shared queue consumption", () => {
  it.each(BACKGROUND_TASK_KINDS)("acknowledges %s once", async (kind) => {
    const task = createBackgroundTaskV2({ env, kind, resourceId: kind });
    await deliver(task, queues[backgroundTaskLane(kind)]);
    await deliver(task, queues[backgroundTaskLane(kind)]);
    expect(backgroundFixture.executed).toEqual([kind]);
  });
  it("acknowledges a persisted business retry", async () => {
    const result = await deliver(
      createBackgroundTaskV2({ env, kind: "notification.publish", resourceId: "business-retry" }),
    );
    expect(backgroundFixture.rescheduled).toHaveLength(1);
    expect(result.retryMessages).toHaveLength(0);
  });
  it("leaves unexpected failure to transport retry", async () => {
    const result = await deliver(
      createBackgroundTaskV2({ env, kind: "notification.publish", resourceId: "throw" }),
    );
    expect(result.retryMessages).toHaveLength(1);
    expect(backgroundFixture.completed.size).toBe(0);
  });
  it("records exhaustion on the final unexpected attempt", async () => {
    const task = createBackgroundTaskV2({ env, kind: "notification.publish", resourceId: "throw" });
    await deliver(task, "zilobase-background-fast", 6);
    expect(backgroundFixture.exhausted).toEqual([task.taskId]);
    expect(backgroundFixture.completed.size).toBe(0);
  });
  it("AI dead letters finalize delivery without starting another generation", async () => {
    const task = createBackgroundTaskV2({ env, kind: "ai.generate", resourceId: "failed-ai" });
    const result = await deliver(task, "zilobase-ai-runs-dlq");
    expect(backgroundFixture.exhausted).toEqual([task.taskId]);
    expect(backgroundFixture.executed).toEqual([]);
    expect(result.retryMessages).toHaveLength(0);
  });
  it("records DLQ exhaustion without invoking the feature", async () => {
    const task = createBackgroundTaskV2({
      env,
      kind: "notification.publish",
      resourceId: "failed",
    });
    const result = await deliver(task, "zilobase-background-fast-dlq");
    expect(backgroundFixture.exhausted).toEqual([task.taskId]);
    expect(backgroundFixture.executed).toEqual([]);
    expect(result.retryMessages).toHaveLength(0);
  });
  it("rejects foreign cells and wrong lanes before execution", async () => {
    const task = createBackgroundTaskV2({ env, kind: "calendar.sync", resourceId: "foreign" });
    await deliver({ ...task, cellId: "other" });
    await deliver(task, "zilobase-background-fast");
    expect(backgroundFixture.executed).toEqual([]);
  });
});
