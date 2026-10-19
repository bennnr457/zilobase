import { and, eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import {
  database,
  databaseAutomation,
  databaseAutomationRun,
  dataSource,
} from "../../../infrastructure/database/schema";
import { type RuntimeEnv } from "../../../shared/config/config";
import { requireDataSourceAccess } from "../../databases/access/data-source-access";
import { requireOwner, restoreStepOutput } from "../actions/action-values";
import {
  actionFailure,
  AutomationActionError,
  isAutomationLeaseLost,
  isRetryableAutomationDatabaseError,
  RetryableAutomationActionError,
} from "./action-error";
import { type ExecutionContext, loadExecutionContext } from "./execution-context";

import { lockOwnedAutomationRun, ownedRunPredicate, renewRunLease } from "./run-claims";
import { executeClaimedStep } from "./run-step";

export async function executeClaimedRun(runId: string, workerId: string, env: RuntimeEnv) {
  let leaseLost = false;
  let renewing = false;
  const heartbeat = setInterval(() => {
    if (renewing || leaseLost) return;
    renewing = true;
    void renewRunLease(runId, workerId)
      .then((renewed) => {
        leaseLost ||= !renewed;
      })
      .catch(() => {
        leaseLost = true;
      })
      .finally(() => {
        renewing = false;
      });
  }, 30_000);
  try {
    return await executeRunWithLease(runId, workerId, env, async () => {
      if (leaseLost || !(await renewRunLease(runId, workerId))) {
        leaseLost = true;
        throw new AutomationActionError("Automation run lease was lost", "AUTOMATION_LEASE_LOST");
      }
    });
  } catch (error) {
    if (isRetryableAutomationDatabaseError(error)) throw error;
    if (isAutomationLeaseLost(error)) return "retry" as const;
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

async function executeRunWithLease(
  runId: string,
  workerId: string,
  env: RuntimeEnv,
  assertLease: () => Promise<void>,
) {
  let loaded: Awaited<ReturnType<typeof loadExecutionContext>>;
  try {
    loaded = await loadExecutionContext(runId, workerId);
  } catch (error) {
    if (isRetryableAutomationDatabaseError(error)) throw error;
    await failClaimedRun(runId, workerId, actionFailure(error));
    return "failed" as const;
  }
  if (!loaded) return "retry" as const;
  const context: ExecutionContext = {
    ...loaded,
    actionOutputs: {},
    variables: {},
  };
  for (const step of loaded.completedSteps) {
    restoreStepOutput(context, step.actionId, step.outputSummary);
  }

  if (context.automation.status !== "active") {
    await skipClaimedRun(runId, workerId, "automation_inactive");
    return "succeeded" as const;
  }

  try {
    await requireDataSourceAccess(
      context.run.dataSourceId,
      requireOwner(context.automation.ownerUserId),
      "full",
    );
    const [source] = await db
      .select({ config: database.config })
      .from(dataSource)
      .innerJoin(database, eq(database.id, dataSource.parentDatabaseId))
      .where(eq(dataSource.id, context.run.dataSourceId))
      .limit(1);
    if (
      !source ||
      (source.config &&
        typeof source.config === "object" &&
        !Array.isArray(source.config) &&
        (source.config as { locked?: unknown }).locked === true)
    ) {
      throw new AutomationActionError("The source database is locked", "AUTOMATION_SOURCE_LOCKED");
    }

    for (const [actionIndex, action] of context.definition.actions.entries()) {
      if (context.completedSteps.some((step) => step.actionId === action.id)) continue;
      const outcome = await executeClaimedStep(context, action, actionIndex, {
        workerId,
        env,
        assertLease,
      });
      if (outcome === "retry") return "retry" as const;
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      const owned = await lockOwnedAutomationRun(tx, runId, workerId);
      const [updated] = await tx
        .update(databaseAutomationRun)
        .set({
          finishedAt: now,
          leaseExpiresAt: null,
          leaseOwner: null,
          status: "succeeded",
          errorCode: null,
          errorSummary: null,
          updatedAt: now,
        })
        .where(ownedRunPredicate(runId, workerId))
        .returning({ id: databaseAutomationRun.id });
      if (!updated)
        throw new AutomationActionError("Automation run lease was lost", "AUTOMATION_LEASE_LOST");
      await tx
        .update(databaseAutomation)
        .set({ lastRunAt: now, lastRunStatus: "succeeded", updatedAt: now })
        .where(
          and(
            eq(databaseAutomation.id, owned.automationId),
            eq(databaseAutomation.status, "active"),
            eq(databaseAutomation.currentRevisionId, owned.revisionId),
          ),
        );
    });
    return "succeeded" as const;
  } catch (error) {
    if (isRetryableAutomationDatabaseError(error)) throw error;
    if (isAutomationLeaseLost(error)) return "retry" as const;
    if (error instanceof RetryableAutomationActionError) return "retry" as const;
    const failure = actionFailure(error);
    await assertLease();
    await failClaimedRun(runId, workerId, failure);
    return "failed" as const;
  }
}

async function failClaimedRun(runId: string, workerId: string, failure: AutomationActionError) {
  const now = new Date();
  await db.transaction(async (tx) => {
    const owned = await lockOwnedAutomationRun(tx, runId, workerId);
    const [updated] = await tx
      .update(databaseAutomationRun)
      .set({
        errorCode: failure.code,
        errorSummary: failure.message,
        finishedAt: now,
        leaseExpiresAt: null,
        leaseOwner: null,
        status: "failed",
        updatedAt: now,
      })
      .where(ownedRunPredicate(runId, workerId))
      .returning({ id: databaseAutomationRun.id });
    if (!updated)
      throw new AutomationActionError("Automation run lease was lost", "AUTOMATION_LEASE_LOST");
    await tx
      .update(databaseAutomation)
      .set({
        errorActionId: failure.actionId,
        errorCode: failure.code,
        errorSummary: failure.message,
        erroredAt: now,
        lastRunAt: now,
        lastRunStatus: "failed",
        nextRunAt: null,
        status: "error",
        updatedAt: now,
      })
      .where(
        and(
          eq(databaseAutomation.id, owned.automationId),
          eq(databaseAutomation.status, "active"),
          eq(databaseAutomation.currentRevisionId, owned.revisionId),
        ),
      );
  });
}

async function skipClaimedRun(runId: string, workerId: string, skipReason: string) {
  await db.transaction(async (tx) => {
    await lockOwnedAutomationRun(tx, runId, workerId);
    const [updated] = await tx
      .update(databaseAutomationRun)
      .set({
        finishedAt: new Date(),
        leaseExpiresAt: null,
        leaseOwner: null,
        skipReason,
        status: "skipped",
        updatedAt: new Date(),
      })
      .where(ownedRunPredicate(runId, workerId))
      .returning({ id: databaseAutomationRun.id });
    if (!updated)
      throw new AutomationActionError("Automation run lease was lost", "AUTOMATION_LEASE_LOST");
  });
}
