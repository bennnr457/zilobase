import { eq } from "drizzle-orm";
import { createBackgroundTask } from "../../../infrastructure/background/contracts";
import {
  backgroundTransaction,
  dispatchBackgroundTasks,
} from "../../../infrastructure/background/dispatch";
import { db } from "../../../infrastructure/database";
import {
  databaseAutomationRun,
  databaseAutomationStepRun,
} from "../../../infrastructure/database/schema";
import { type RuntimeEnv } from "../../../shared/config/config";
import { restoreStepOutput, toJson } from "../actions/action-values";
import {
  AutomationActionError,
  RetryableAutomationActionError,
  actionFailure,
  isAutomationLeaseLost,
  isRetryableAutomationDatabaseError,
} from "./action-error";
import { executeAction } from "./action-executor";
import { type ExecutionContext } from "./execution-context";
import {
  lockOwnedAutomationRun,
  ownedRunPredicate,
  type AutomationTransaction,
} from "./run-claims";

export async function executeClaimedStep(
  context: ExecutionContext,
  action: ExecutionContext["definition"]["actions"][number],
  actionIndex: number,
  execution: { workerId: string; env: RuntimeEnv; assertLease: () => Promise<void> },
) {
  const { workerId, env, assertLease } = execution;
  const runId = context.run.id;
  await assertLease();
  const step = await db.transaction(async (tx) => {
    await lockOwnedAutomationRun(tx, runId, workerId);
    return startStep(tx, runId, action.id, actionIndex);
  });
  if (step.status === "succeeded") {
    restoreStepOutput(context, action.id, step.outputSummary);
    return "completed" as const;
  }
  try {
    await assertLease();
    const output = await executeAction(context, action, env);
    await assertLease();
    await db.transaction(async (tx) => {
      await lockOwnedAutomationRun(tx, runId, workerId);
      await tx
        .update(databaseAutomationStepRun)
        .set({
          finishedAt: new Date(),
          outputSummary: toJson(output),
          status: "succeeded",
          errorCode: null,
          errorSummary: null,
          updatedAt: new Date(),
        })
        .where(eq(databaseAutomationStepRun.id, step.id));
    });
    restoreStepOutput(context, action.id, output);
  } catch (error) {
    if (isRetryableAutomationDatabaseError(error)) throw error;
    if (isAutomationLeaseLost(error)) return "retry" as const;
    // A provider can fail after the heartbeat has observed a lost lease.
    await assertLease();
    const failure = actionFailure(error, action.id);
    if (failure instanceof RetryableAutomationActionError) {
      await backgroundTransaction(env, async (tx) => {
        await lockOwnedAutomationRun(tx, runId, workerId);
        await tx
          .update(databaseAutomationStepRun)
          .set({
            errorCode: failure.code,
            errorSummary: failure.message,
            finishedAt: null,
            status: "queued",
            updatedAt: new Date(),
          })
          .where(eq(databaseAutomationStepRun.id, step.id));
        const [updated] = await tx
          .update(databaseAutomationRun)
          .set({
            availableAt: failure.availableAt,
            errorCode: failure.code,
            errorSummary: failure.message,
            leaseExpiresAt: null,
            leaseOwner: null,
            status: "queued",
            updatedAt: new Date(),
          })
          .where(ownedRunPredicate(runId, workerId))
          .returning({ id: databaseAutomationRun.id });
        if (!updated)
          throw new AutomationActionError("Automation run lease was lost", "AUTOMATION_LEASE_LOST");
        await dispatchBackgroundTasks(env, [
          createBackgroundTask({
            availableAt: failure.availableAt,
            env,
            kind: "automation.run",
            resourceId: runId,
          }),
        ]);
      });
      return "retry" as const;
    }
    await db.transaction(async (tx) => {
      await lockOwnedAutomationRun(tx, runId, workerId);
      await tx
        .update(databaseAutomationStepRun)
        .set({
          errorCode: failure.code,
          errorSummary: failure.message,
          finishedAt: new Date(),
          status: "failed",
          updatedAt: new Date(),
        })
        .where(eq(databaseAutomationStepRun.id, step.id));
    });
    throw failure;
  }
  return "completed" as const;
}

async function startStep(
  tx: AutomationTransaction,
  runId: string,
  actionId: string,
  actionIndex: number,
) {
  const idempotencyKey = `${runId}:${actionId}`;
  const now = new Date();
  const [created] = await tx
    .insert(databaseAutomationStepRun)
    .values({
      actionId,
      actionIndex,
      attempts: 1,
      createdAt: now,
      id: crypto.randomUUID(),
      idempotencyKey,
      runId,
      startedAt: now,
      status: "running",
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [existing] = await tx
    .select()
    .from(databaseAutomationStepRun)
    .where(eq(databaseAutomationStepRun.idempotencyKey, idempotencyKey))
    .limit(1);
  if (!existing) throw new AutomationActionError("Action receipt was unavailable");
  if (existing.status === "succeeded") return existing;
  const [claimed] = await tx
    .update(databaseAutomationStepRun)
    .set({
      attempts: existing.attempts + 1,
      startedAt: now,
      status: "running",
      updatedAt: now,
    })
    .where(eq(databaseAutomationStepRun.id, existing.id))
    .returning();
  if (!claimed) throw new AutomationActionError("Action receipt was unavailable");
  return claimed;
}
