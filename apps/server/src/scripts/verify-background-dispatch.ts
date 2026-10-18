import { seedCutoverAcceptance, assertCutoverAcceptance } from "./verify-background-cutover";
import {
  previewBackgroundCutover,
  applyBackgroundCutover,
} from "../app/background/operations/cutover";
import { replayBackgroundFailure } from "../app/background/operations/replay";
import {
  ensureBackgroundMaintenanceTasks,
  runDueBackgroundMaintenance,
} from "../app/background/maintenance";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { runMigrationSets } from "@zilobase/runtime-adapter/node";
import { runWithRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import { createDbClientForUrl, runWithDb } from "../infrastructure/database";
import { CORE_MIGRATION_SET } from "../public/node-adapter-api";
import {
  backgroundDispatch,
  workspace,
  backgroundMaintenanceTask,
  user,
  inProductNotification,
  inProductNotificationOutbox,
} from "../infrastructure/database/schema";
import { createBackgroundTask } from "../infrastructure/background/contracts";
import {
  backgroundTransaction,
  persistBackgroundTasks,
  publishBackgroundDispatches,
  createBackgroundDeliveryStore,
} from "../infrastructure/background/publication";
import {
  recordBackgroundExhaustion,
  reconcileBackgroundFailures,
} from "../app/background/failures";
import { runBackgroundDelivery } from "../app/background/delivery";

const connection = process.env.ZILOBASE_BACKGROUND_VERIFY_URL;
assert.ok(connection, "Use the isolated background runner");
const url = new URL(connection);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/zilobase_background_verify");
const first = createDbClientForUrl(connection);
const second = createDbClientForUrl(connection);
const env = { ZILOBASE_CELL_ID: "verification", DATABASE_URL: connection };
const sent: string[] = [];
let brokerDown = true;
const ports = {
  jobs: {
    async dispatch(tasks: readonly { taskId: string }[]) {
      if (brokerDown) throw new Error("broker unavailable");
      sent.push(...tasks.map((task) => task.taskId));
    },
  },
};
try {
  await first.client.connect();
  await second.client.connect();
  const tables = await first.client.query(
    "select count(*)::int as count from information_schema.tables where table_schema='public'",
  );
  assert.equal(tables.rows[0].count, 0, "Fixture refuses nonempty database");
  await runMigrationSets(first.db, [CORE_MIGRATION_SET]);
  await runWithRuntimePorts(ports, () =>
    runWithDb(first.db, async () => {
      await assert.rejects(
        backgroundTransaction(env, async (tx) => {
          await tx.insert(workspace).values({ id: "rollback", name: "Rollback", slug: "rollback" });
          await persistBackgroundTasks(env, [
            createBackgroundTask({ env, kind: "notification.publish", resourceId: "rollback" }),
          ]);
          throw new Error("rollback fixture");
        }),
      );
    }),
  );
  assert.equal((await first.db.select().from(workspace)).length, 0);
  assert.equal((await first.db.select().from(backgroundDispatch)).length, 0);
  await first.db.insert(workspace).values({ id: "workspace", name: "Fixture", slug: "fixture" });
  await runWithRuntimePorts(ports, () =>
    runWithDb(first.db, async () => {
      await assert.rejects(
        backgroundTransaction(env, async () => {
          await persistBackgroundTasks(env, [
            createBackgroundTask({
              env,
              kind: "notification.publish",
              resourceId: "nested-rollback",
            }),
          ]);
          assert.deepEqual(await publishBackgroundDispatches(env), { published: 0, claimed: 0 });
          assert.equal(sent.length, 0, "Nested source writes cannot publish before outer commit");
          throw new Error("nested rollback");
        }),
      );
      assert.equal((await first.db.select().from(backgroundDispatch)).length, 0);
      await persistBackgroundTasks(env, [
        createBackgroundTask({ env, kind: "notification.publish", resourceId: "once" }),
      ]);
      const [dispatch] = await first.db.select().from(backgroundDispatch);
      assert.equal(dispatch.resourceId, "once");
      assert.equal(dispatch.status, "pending");
      await first.db.update(backgroundDispatch).set({ nextPublicationAt: new Date(0) });
      brokerDown = false;
      await Promise.all([
        publishBackgroundDispatches(env),
        runWithDb(second.db, () => publishBackgroundDispatches(env)),
      ]);
      assert.deepEqual(sent, [dispatch.id], "Competing publishers converge");
      let effects = 0;
      const store = createBackgroundDeliveryStore(env, "fixture-worker");
      const delivery = () =>
        runBackgroundDelivery({
          body: dispatch.task,
          cellId: env.ZILOBASE_CELL_ID,
          lane: "fast",
          store,
          execute: async () => {
            effects++;
            return { outcome: "completed" };
          },
        });
      await delivery();
      await delivery();
      assert.equal(effects, 1);
      await first.db.update(backgroundDispatch).set({ nextPublicationAt: new Date(0) });
      await publishBackgroundDispatches(env);
      assert.equal(sent.length, 1, "Completed work never republishes");
      const future = createBackgroundTask({
        env,
        kind: "notification.publish",
        resourceId: "beyond-horizon",
        availableAt: new Date(Date.now() + 13 * 3600_000),
      });
      await persistBackgroundTasks(env, [future]);
      await publishBackgroundDispatches(env);
      assert.ok(!sent.includes(future.taskId), "Work beyond twelve hours stays in PostgreSQL");

      const task = createBackgroundTask({ env, kind: "notification.publish", resourceId: "retry" });
      await persistBackgroundTasks(env, [task]);
      await runBackgroundDelivery({
        body: task,
        cellId: env.ZILOBASE_CELL_ID,
        lane: "fast",
        store,
        execute: async () => ({
          outcome: "retry",
          availableAt: new Date(Date.now() + 1000).toISOString(),
        }),
      });
      const rows = await first.db.select().from(backgroundDispatch);
      assert.equal(
        rows.filter((row) => row.resourceId === "retry").length,
        2,
        "Business retry is a new occurrence",
      );
      assert.equal(rows.find((row) => row.id === task.taskId)?.status, "completed");
      const failing = createBackgroundTask({
        env,
        kind: "notification.publish",
        resourceId: "exhaustion",
      });
      await persistBackgroundTasks(env, [failing]);
      await publishBackgroundDispatches(env);
      const [ticket] = await first.db
        .select()
        .from(backgroundDispatch)
        .where(eq(backgroundDispatch.resourceId, failing.resourceId));
      await recordBackgroundExhaustion(env, ticket.task, "fast");
      assert.equal(
        (
          await first.db
            .select()
            .from(backgroundDispatch)
            .where(eq(backgroundDispatch.id, ticket.id))
        )[0].status,
        "exhausted",
      );
      await reconcileBackgroundFailures(env);
      const [failure] = await first.db
        .select()
        .from(backgroundDispatch)
        .where(eq(backgroundDispatch.id, ticket.id));
      assert.ok(failure.failureHandledAt);
      await first.db
        .update(backgroundDispatch)
        .set({ nextPublicationAt: new Date(0) })
        .where(eq(backgroundDispatch.id, ticket.id));
      await publishBackgroundDispatches(env);
      assert.equal(
        sent.filter((id) => id === ticket.id).length,
        1,
        "Exhaustion cannot be replayed by publication recovery",
      );
      const queued = createBackgroundTask({
        env,
        kind: "notification.publish",
        resourceId: "maintenance",
      });
      await persistBackgroundTasks(env, [queued]);
      await ensureBackgroundMaintenanceTasks();
      await first.db
        .update(backgroundMaintenanceTask)
        .set({ nextRunAt: new Date(Date.now() + 86400_000) });
      await first.db
        .update(backgroundMaintenanceTask)
        .set({ nextRunAt: new Date(0) })
        .where(eq(backgroundMaintenanceTask.taskKey, "background.reconcile"));
      await runDueBackgroundMaintenance({ env, workerId: "fixture-maintenance" });
      assert.equal(
        (
          await first.db
            .select()
            .from(backgroundDispatch)
            .where(eq(backgroundDispatch.id, queued.taskId))
        )[0].status,
        "published",
        "Maintenance may publish work but cannot invoke a feature handler",
      );
      assert.ok(
        (
          await first.db
            .select()
            .from(backgroundMaintenanceTask)
            .where(eq(backgroundMaintenanceTask.taskKey, "background.reconcile"))
        )[0].lastSucceededAt,
      );
      await first.db
        .insert(user)
        .values({ id: "operator-owner", name: "Fixture", email: "owner@background.invalid" });
      await first.db.insert(inProductNotification).values({
        id: "replay-notification",
        workspaceId: "workspace",
        userId: "operator-owner",
        message: "Replay notification",
      });
      await first.db.insert(inProductNotificationOutbox).values({
        id: "replay-outbox",
        notificationId: "replay-notification",
        workspaceId: "workspace",
        userId: "operator-owner",
        nextAttemptAt: new Date(),
      });
      const replayable = createBackgroundTask({
        env,
        kind: "notification.publish",
        resourceId: "replay-outbox",
      });
      await persistBackgroundTasks(env, [replayable]);
      const [replayTicket] = await first.db
        .select()
        .from(backgroundDispatch)
        .where(eq(backgroundDispatch.resourceId, replayable.resourceId));
      await recordBackgroundExhaustion(env, replayTicket.task, "fast");
      await reconcileBackgroundFailures(env);
      assert.equal(
        (
          await first.db
            .select()
            .from(inProductNotificationOutbox)
            .where(eq(inProductNotificationOutbox.id, "replay-outbox"))
        )[0].status,
        "failed",
      );
      const replay = await replayBackgroundFailure(env, replayTicket.id);
      assert.notEqual(replay.taskId, replayTicket.id);
      assert.equal(
        (
          await first.db
            .select()
            .from(inProductNotificationOutbox)
            .where(eq(inProductNotificationOutbox.id, "replay-outbox"))
        )[0].status,
        "pending",
      );
      await assert.rejects(replayBackgroundFailure(env, replayTicket.id), /INELIGIBLE/);
      await first.db
        .update(inProductNotificationOutbox)
        .set({ status: "published" })
        .where(eq(inProductNotificationOutbox.id, "replay-outbox"));
      const completed = (
        await first.db
          .select()
          .from(backgroundDispatch)
          .where(eq(backgroundDispatch.resourceId, "once"))
      )[0];
      await assert.rejects(replayBackgroundFailure(env, replayTicket.id), /INELIGIBLE/);
      await seedCutoverAcceptance(env);
      const options = {
        cellId: env.ZILOBASE_CELL_ID,
        cutoff: new Date(Date.now() + 100),
        isolatedDatabase: true,
        runtimesStopped: true,
      };
      const beforeCutover = await first.db.select().from(backgroundDispatch);
      const preview = await previewBackgroundCutover(env, options);
      assert.ok(preview.counts.dispatches > 0);
      assert.deepEqual(
        await first.db.select().from(backgroundDispatch),
        beforeCutover,
        "Preview is read only",
      );
      let purges = 0;
      await assert.rejects(
        applyBackgroundCutover(env, { ...options, isolatedDatabase: false }, async () => {
          purges++;
        }),
        /ISOLATED/,
      );
      await applyBackgroundCutover(env, options, async () => {
        purges++;
      });
      await applyBackgroundCutover(env, options, async () => {
        purges++;
      });
      await assertCutoverAcceptance(options.cutoff);
      const foreignEnv = { ...env, ZILOBASE_CELL_ID: "another-cell" };
      const foreign = createBackgroundTask({
        env: foreignEnv,
        kind: "notification.publish",
        resourceId: "foreign",
      });
      await persistBackgroundTasks(foreignEnv, [foreign]);
      await assert.rejects(
        applyBackgroundCutover(env, options, async () => {
          purges++;
        }),
        /FOREIGN_CELL/,
      );
      await first.db.delete(backgroundDispatch).where(eq(backgroundDispatch.id, foreign.taskId));
      const newer = createBackgroundTask({
        env,
        kind: "notification.publish",
        resourceId: "post-cutover",
      });
      await persistBackgroundTasks(env, [newer]);
      await first.db
        .update(backgroundDispatch)
        .set({ createdAt: new Date(options.cutoff.getTime() + 1) })
        .where(eq(backgroundDispatch.id, newer.taskId));
      await assert.rejects(
        applyBackgroundCutover(env, options, async () => {
          purges++;
        }),
        /CUTOFF_PRECEDES/,
      );
      await first.db
        .update(backgroundDispatch)
        .set({ status: "cancelled" })
        .where(eq(backgroundDispatch.id, newer.taskId));

      assert.equal(purges, 2, "Fixed-cutoff apply is safely repeatable");
      assert.equal(
        (
          await first.db
            .select()
            .from(backgroundDispatch)
            .where(eq(backgroundDispatch.id, queued.taskId))
        )[0].status,
        "cancelled",
      );
      assert.deepEqual(
        (
          await first.db
            .select()
            .from(backgroundDispatch)
            .where(eq(backgroundDispatch.id, completed.id))
        )[0],
        completed,
        "Completed execution is unchanged",
      );
      assert.equal((await first.db.select().from(workspace)).length, 1);
    }),
  );
  console.info(
    "Background PostgreSQL verification passed: migrations, rollback, commit/enqueue failure, competing publication, duplicates, completion and business retries.",
  );
} finally {
  await first.client.end();
  await second.client.end();
}

if (process.env.ZILOBASE_BACKGROUND_VERIFY_SQL_ONLY !== "true") {
  if (process.env.ZILOBASE_BACKGROUND_VERIFY_PROCESSOR_ONLY !== "true")
    await import("./verify-node-queues");
  await import("./verify-background-processor");
}
