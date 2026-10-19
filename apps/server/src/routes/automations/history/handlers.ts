import type { Handler } from "hono";
import { exportDatabaseAutomationAudit } from "../../../services/automations/history/audit-export";
import {
  getDatabaseAutomationRun,
  listDatabaseAutomationRuns,
} from "../../../services/automations/history/run-history";
import type { AppBindings } from "../../../shared/contracts/http";
import { requireDatabaseRouteUser } from "../../databases/support";
import { handle, requireAutomationSource } from "../support";
export const exportAutomationAudit: Handler<AppBindings, "/:databaseId/automations/audit"> = async (
  c,
) => {
  const source = requireAutomationSource(c);
  if (!source.ok) return source.response;
  const { user, dataSourceId } = source;
  return handle(c, () =>
    exportDatabaseAutomationAudit({
      databaseId: c.req.param("databaseId"),
      dataSourceId,
      userId: user.id,
    }),
  );
};

export const listAutomationRuns: Handler<
  AppBindings,
  "/:databaseId/automations/:automationId/runs"
> = async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const requestedLimit = Number(c.req.query("limit") ?? 50);
  return handle(c, () =>
    listDatabaseAutomationRuns({
      automationId: c.req.param("automationId"),
      databaseId: c.req.param("databaseId"),
      limit: Number.isFinite(requestedLimit) ? requestedLimit : 50,
      userId: user.id,
    }),
  );
};

export const readAutomationRun: Handler<
  AppBindings,
  "/:databaseId/automations/:automationId/runs/:runId"
> = async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return handle(c, () =>
    getDatabaseAutomationRun({
      automationId: c.req.param("automationId"),
      databaseId: c.req.param("databaseId"),
      runId: c.req.param("runId"),
      userId: user.id,
    }),
  );
};
