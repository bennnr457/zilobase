import type { Handler } from "hono";
import {
  exportAutomationAuditOperation,
  listAutomationRunsOperation,
  readAutomationRunOperation,
} from "../../../services/automations/history/operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
export const exportAutomationAudit: Handler<AppBindings, "/:databaseId/automations/audit"> = async (
  c,
) =>
  c.json(
    await exportAutomationAuditOperation(serverOperationContext(c), {
      databaseId: c.req.param("databaseId")!,
      dataSourceId: c.req.query("dataSourceId"),
    }),
    200,
  );

export const listAutomationRuns: Handler<
  AppBindings,
  "/:databaseId/automations/:automationId/runs"
> = async (c) =>
  c.json(
    await listAutomationRunsOperation(serverOperationContext(c), {
      databaseId: c.req.param("databaseId")!,
      limit: c.req.query("limit"),
      automationId: c.req.param("automationId")!,
    }),
    200,
  );

export const readAutomationRun: Handler<
  AppBindings,
  "/:databaseId/automations/:automationId/runs/:runId"
> = async (c) =>
  c.json(
    await readAutomationRunOperation(serverOperationContext(c), {
      databaseId: c.req.param("databaseId")!,
      automationId: c.req.param("automationId")!,
      runId: c.req.param("runId")!,
    }),
    200,
  );
