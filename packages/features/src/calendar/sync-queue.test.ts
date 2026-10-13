import assert from "node:assert/strict";
import test from "node:test";
import { runCalendarSyncOnce } from "./sync-queue";

test("sync requests coalesce, promote queued work, isolate scopes, and drain after failure", async () => {
  const order: string[] = [];
  let release!: () => void;
  const active = runCalendarSyncOnce(
    "queue-a",
    "active",
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const background = runCalendarSyncOnce("queue-a", "background", async () =>
    order.push("background"),
  );
  const destination = runCalendarSyncOnce("queue-a", "destination", async () =>
    order.push("destination"),
  );
  const duplicate = runCalendarSyncOnce(
    "queue-a",
    "destination",
    async () => assert.fail("duplicate ran"),
    10,
  );
  assert.equal(destination, duplicate);
  await runCalendarSyncOnce("queue-b", "active", async () => order.push("independent"));
  release();
  await Promise.all([active, background, destination]);
  assert.deepEqual(order, ["independent", "destination", "background"]);

  const failure = runCalendarSyncOnce("queue-a", "failed", async () => {
    throw new Error("failed");
  });
  const next = runCalendarSyncOnce("queue-a", "after", async () => "after");
  await assert.rejects(failure, /failed/);
  assert.equal(await next, "after");
  assert.equal(await runCalendarSyncOnce("queue-a", "failed", async () => "retried"), "retried");
});
