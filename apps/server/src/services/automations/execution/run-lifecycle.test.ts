import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectRows: [] as unknown[][],
  writes: [] as Array<{ table: unknown; values: Record<string, unknown>; where?: unknown }>,
  predicates: [] as unknown[],
  queries: [] as unknown[],
  renewed: true,
  receiptCreated: true,
  claimedIds: ["run-1"],
  context: vi.fn(),
  access: vi.fn(),
  action: vi.fn(),
  dispatch: vi.fn(),
  recovered: vi.fn(),
}));

vi.mock("../../../infrastructure/database", () => {
  const db = {
    execute(query: unknown) {
      mocks.queries.push(query);
      return Promise.resolve({ rows: [{ now: new Date("2026-01-01T00:00:00Z") }] });
    },
    transaction<T>(work: (tx: Record<string, unknown>) => Promise<T>): Promise<T> {
      return work(db);
    },
    select(fields?: Record<string, unknown>) {
      const rows =
        fields?.automationId && fields?.revisionId
          ? mocks.renewed
            ? [{ id: "run-1", automationId: "automation-1", revisionId: "pinned-revision" }]
            : []
          : mocks.selectRows.shift();
      if (!rows) throw new Error("Unexpected database read");
      const builder = {
        from() {
          return builder;
        },
        innerJoin() {
          return builder;
        },
        where(predicate: unknown) {
          mocks.predicates.push(predicate);
          return builder;
        },
        orderBy() {
          return builder;
        },
        groupBy() {
          return builder;
        },
        limit() {
          return builder;
        },
        for() {
          return builder;
        },
        then(resolve: (rows: unknown[]) => unknown) {
          return Promise.resolve(rows).then(resolve);
        },
      };
      return builder;
    },
    update(table: unknown) {
      const write = { table, values: {} as Record<string, unknown>, where: undefined as unknown };
      const builder = {
        set(values: Record<string, unknown>) {
          write.values = values;
          mocks.writes.push(write);
          return builder;
        },
        where(predicate: unknown) {
          write.where = predicate;
          return builder;
        },
        returning() {
          const rows =
            typeof write.values.attempts === "number"
              ? [{ id: "step-existing" }]
              : write.values.status === "running"
                ? mocks.claimedIds.map((id) => ({ id }))
                : mocks.renewed
                  ? [{ id: "run-1" }]
                  : [];
          return Promise.resolve(rows);
        },
        then(resolve: (rows: unknown[]) => unknown) {
          return Promise.resolve([]).then(resolve);
        },
      };
      return builder;
    },
    insert(table: unknown) {
      const builder = {
        values(values: Record<string, unknown>) {
          mocks.writes.push({ table, values });
          return builder;
        },
        onConflictDoNothing() {
          return builder;
        },
        returning() {
          return Promise.resolve(mocks.receiptCreated ? [{ id: "step-1", status: "running" }] : []);
        },
      };
      return builder;
    },
  };
  return { db };
});
vi.mock("./execution-context", () => ({ loadExecutionContext: mocks.context }));
vi.mock("./action-executor", () => ({ executeAction: mocks.action }));
vi.mock("../../databases/access/data-source-access", () => ({
  requireDataSourceAccess: mocks.access,
}));
vi.mock("../../../infrastructure/background/dispatch", () => ({
  backgroundTransaction: async (_env: unknown, work: (tx: unknown) => unknown) => {
    const { db } = await import("../../../infrastructure/database");
    return db.transaction(work as never);
  },
  dispatchBackgroundTasks: mocks.dispatch,
}));
vi.mock("../../../infrastructure/background/telemetry", () => ({
  recordRecoveredBackgroundLease: mocks.recovered,
}));

import type { RuntimeEnv } from "../../../shared/config/config";
import { AutomationActionError, RetryableAutomationActionError } from "./action-error";
import { AutomationRunCapacityError, drainDatabaseAutomationRuns } from "./run-engine";

const env = { DATABASE_AUTOMATIONS_ENABLED: "true" } as RuntimeEnv;
const dialect = new PgDialect();
const sqlQuery = (value: unknown) => dialect.sqlToQuery(value as SQL);
const writes = (table: string, status: string) =>
  mocks.writes.filter(
    (write) =>
      getTableName(write.table as Parameters<typeof getTableName>[0]) === table &&
      write.values.status === status,
  );

function prepare(status = "queued", completedSteps: unknown[] = []) {
  mocks.selectRows.push(
    [{ id: "run-1", status, workspaceId: "workspace-1" }],
    [],
    [{ config: {} }],
  );
  mocks.context.mockResolvedValue({
    automation: { id: "automation-1", ownerUserId: "owner-1", status: "active" },
    completedSteps,
    definition: { actions: [{ id: "action-1", type: "define_variables", variables: [] }] },
    properties: [],
    propertyValues: {},
    row: null,
    run: { id: "run-1", dataSourceId: "source-1", revisionId: "pinned-revision" },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  mocks.selectRows.length =
    mocks.writes.length =
    mocks.predicates.length =
    mocks.queries.length =
      0;
  mocks.renewed = true;
  mocks.receiptCreated = true;
  mocks.claimedIds = ["run-1"];
  mocks.context.mockReset();
  mocks.action.mockReset();
  mocks.access.mockReset();
  mocks.dispatch.mockReset();
  mocks.recovered.mockReset();
  mocks.action.mockResolvedValue({ variables: { result: "done" } });
});
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

describe("claimed automation run lifecycle", () => {
  it("does not execute duplicate delivery when no work can be claimed", async () => {
    mocks.selectRows.push([]);
    expect(
      await drainDatabaseAutomationRuns(env, { runId: "run-1", workerId: "worker-1" }),
    ).toEqual({ claimed: 0, failed: 0, retried: 0, succeeded: 0 });
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.action).not.toHaveBeenCalled();
  });

  it("recovers an expired claim and retains its receipt identity", async () => {
    prepare("running");
    expect(await drainDatabaseAutomationRuns(env, { workerId: "worker-1" })).toEqual({
      claimed: 1,
      failed: 0,
      retried: 0,
      succeeded: 1,
    });
    expect(mocks.recovered).toHaveBeenCalledWith(env, "automation.run");
    expect(mocks.context).toHaveBeenCalledWith("run-1", "worker-1");
    expect(mocks.access).toHaveBeenCalledWith("source-1", "owner-1", "full");
    expect(writes("database_automation_step_run", "running")[0]?.values.idempotencyKey).toBe(
      "run-1:action-1",
    );
    const terminal = writes("database_automation_run", "succeeded")[0]!;
    expect(sqlQuery(terminal.where).params).toEqual(["run-1", "running", "worker-1"]);
    expect(
      mocks.queries.map(sqlQuery).some((query) => query.sql.includes("pg_advisory_xact_lock")),
    ).toBe(true);
  });

  it("restores completed action output and skips that action on recovery", async () => {
    prepare("running", [{ actionId: "action-1", outputSummary: { variables: { restored: 7 } } }]);
    const context = await mocks.context();
    context.definition.actions.push({ id: "action-2", type: "define_variables", variables: [] });
    await drainDatabaseAutomationRuns(env, { workerId: "worker-1" });
    expect(mocks.action).toHaveBeenCalledTimes(1);
    expect(mocks.action.mock.calls[0]?.[1].id).toBe("action-2");
    expect(mocks.action.mock.calls[0]?.[0].variables).toMatchObject({ restored: 7 });
    expect(writes("database_automation_step_run", "running")[0]?.values.idempotencyKey).toBe(
      "run-1:action-2",
    );
  });

  it("reclaims an existing failed receipt without changing its idempotency key", async () => {
    prepare();
    mocks.receiptCreated = false;
    mocks.selectRows.push([{ id: "step-existing", status: "failed", attempts: 2 }]);
    await drainDatabaseAutomationRuns(env, { workerId: "worker-1" });
    const receiptWrites = writes("database_automation_step_run", "running");
    expect(receiptWrites[0]?.values.idempotencyKey).toBe("run-1:action-1");
    expect(receiptWrites[1]?.values.attempts).toBe(3);
    expect(sqlQuery(receiptWrites[1]?.where).params).toEqual(["step-existing"]);
    expect(mocks.action).toHaveBeenCalledTimes(1);
  });

  it("renews the claim during a slow action and stops its heartbeat afterward", async () => {
    prepare();
    const action = Promise.withResolvers<Record<string, unknown>>();
    mocks.action.mockReturnValue(action.promise);
    const run = drainDatabaseAutomationRuns(env, { workerId: "worker-1" });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.action).toHaveBeenCalledTimes(1);
    expect(
      mocks.writes.filter((write) => write.values.leaseExpiresAt && !write.values.status).length,
    ).toBeGreaterThanOrEqual(3);
    action.resolve({});
    await run;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("records terminal provider failure on both the receipt and automation", async () => {
    prepare();
    mocks.action.mockRejectedValue(
      new AutomationActionError("Provider rejected", "PROVIDER_DENIED"),
    );
    expect(await drainDatabaseAutomationRuns(env, { workerId: "worker-1" })).toEqual({
      claimed: 1,
      failed: 1,
      retried: 0,
      succeeded: 0,
    });
    expect(writes("database_automation_step_run", "failed")[0]?.values.errorCode).toBe(
      "PROVIDER_DENIED",
    );
    expect(writes("database_automation", "error")[0]?.values).toMatchObject({
      errorCode: "PROVIDER_DENIED",
      errorActionId: "action-1",
    });
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("queues retryable provider failure before dispatching the durable retry", async () => {
    prepare();
    const availableAt = new Date("2026-01-01T00:01:00Z");
    mocks.action.mockRejectedValue(
      new RetryableAutomationActionError("Reconnect required", "PROVIDER_RETRY", availableAt),
    );
    expect(await drainDatabaseAutomationRuns(env, { workerId: "worker-1" })).toEqual({
      claimed: 1,
      failed: 0,
      retried: 1,
      succeeded: 0,
    });
    expect(writes("database_automation_step_run", "queued")[0]?.values).toMatchObject({
      finishedAt: null,
      errorCode: "PROVIDER_RETRY",
    });
    expect(writes("database_automation_run", "queued")[0]?.values).toMatchObject({
      availableAt,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
    expect(writes("database_automation", "error")).toHaveLength(0);
  });

  it("does not complete a step or run after losing its lease during an action", async () => {
    prepare();
    mocks.action.mockImplementation(async () => {
      mocks.renewed = false;
      return {};
    });
    expect(await drainDatabaseAutomationRuns(env, { workerId: "worker-1" })).toEqual({
      claimed: 1,
      failed: 0,
      retried: 1,
      succeeded: 0,
    });
    expect(writes("database_automation_step_run", "succeeded")).toHaveLength(0);
    expect(writes("database_automation_run", "succeeded")).toHaveLength(0);
    expect(writes("database_automation", "error")).toHaveLength(0);
  });

  it("stops revoked access before executing actions and records a terminal failure", async () => {
    prepare();
    mocks.access.mockRejectedValue(new AutomationActionError("Access revoked", "ACCESS_REVOKED"));
    expect(await drainDatabaseAutomationRuns(env, { workerId: "worker-1" })).toEqual({
      claimed: 1,
      failed: 1,
      retried: 0,
      succeeded: 0,
    });
    expect(mocks.action).not.toHaveBeenCalled();
    expect(writes("database_automation", "error")[0]?.values).toMatchObject({
      errorCode: "ACCESS_REVOKED",
      nextRunAt: null,
    });
  });

  it("defers targeted delivery when workspace capacity is full", async () => {
    mocks.selectRows.push(
      [{ id: "run-1", status: "queued", workspaceId: "workspace-1" }],
      [{ count: 10, workspaceId: "workspace-1" }],
    );
    await expect(
      drainDatabaseAutomationRuns(env, { runId: "run-1", workerId: "worker-1" }),
    ).rejects.toBeInstanceOf(AutomationRunCapacityError);
    expect(mocks.action).not.toHaveBeenCalled();
  });
});

describe("automation recovery regressions", () => {
  it("durably defers disabled execution instead of completing the delivery", async () => {
    const { processDatabaseAutomationRun } = await import("./run-engine");
    const { runBackgroundDelivery } = await import("../../../app/background/delivery");
    const store = {
      load: vi.fn().mockResolvedValue("ready"),
      complete: vi.fn(),
      reschedule: vi.fn(),
    };
    await runBackgroundDelivery({
      body: {
        version: 2,
        cellId: "default",
        taskId: crypto.randomUUID(),
        kind: "automation.run",
        resourceId: "run-1",
        availableAt: new Date().toISOString(),
      },
      cellId: "default",
      lane: "automation",
      store,
      execute: () =>
        processDatabaseAutomationRun(
          { DATABASE_AUTOMATIONS_EXECUTION_DISABLED: "true" },
          { runId: "run-1", workerId: "worker-1" },
        ),
    });
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.reschedule).toHaveBeenCalledWith(expect.anything(), "2026-01-01T00:01:00.000Z");
  });

  it("does not fail a step or automation after losing its lease during a failing action", async () => {
    prepare();
    const action = Promise.withResolvers<Record<string, unknown>>();
    mocks.action.mockReturnValue(action.promise);
    const run = drainDatabaseAutomationRuns(env, { workerId: "worker-1" });
    await vi.advanceTimersByTimeAsync(0);
    mocks.renewed = false;
    await vi.advanceTimersByTimeAsync(30_000);
    action.reject(new AutomationActionError("Provider rejected", "PROVIDER_DENIED"));
    await run;
    expect(writes("database_automation_step_run", "failed")).toHaveLength(0);
    expect(writes("database_automation", "error")).toHaveLength(0);
  });

  it("propagates temporary context database failures for transport retry", async () => {
    prepare();
    const error = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
    mocks.context.mockRejectedValue(error);
    mocks.selectRows.splice(2, 1, [{ automationId: "automation-1" }]);
    await expect(drainDatabaseAutomationRuns(env, { workerId: "worker-1" })).rejects.toBe(error);
    expect(writes("database_automation", "error")).toHaveLength(0);
  });
});

it.each(["ECONNRESET", "40001", "40P01"])(
  "retries wrapped database failure %s during an action without terminal writes",
  async (code) => {
    prepare();
    const error = new Error("query failed", { cause: { code } });
    mocks.action.mockRejectedValue(error);
    await expect(drainDatabaseAutomationRuns(env, { workerId: "worker-1" })).rejects.toBe(error);
    expect(writes("database_automation", "error")).toHaveLength(0);
    expect(writes("database_automation_step_run", "failed")).toHaveLength(0);
  },
);

it("reuses a successful receipt found after loading context", async () => {
  prepare();
  mocks.receiptCreated = false;
  mocks.selectRows.push([
    { id: "step-existing", status: "succeeded", outputSummary: { variables: { restored: 7 } } },
  ]);
  await drainDatabaseAutomationRuns(env, { workerId: "worker-1" });
  expect(mocks.action).not.toHaveBeenCalled();
  expect(writes("database_automation_step_run", "succeeded")).toHaveLength(0);
});

it("fences parent failure updates to the active pinned revision", async () => {
  prepare();
  mocks.action.mockRejectedValue(new AutomationActionError("Failed"));
  await drainDatabaseAutomationRuns(env, { workerId: "worker-1" });
  const failure = writes("database_automation", "error")[0]!;
  expect(sqlQuery(failure.where).params).toEqual(["automation-1", "active", "pinned-revision"]);
  const predicates = mocks.predicates.map(sqlQuery);
  expect(predicates.some(({ sql }) => sql.includes("clock_timestamp()"))).toBe(true);
});
