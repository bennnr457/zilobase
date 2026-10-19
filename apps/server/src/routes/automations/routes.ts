import { Hono } from "hono";
import { setAutomationPausedOperation } from "../../services/automations/lifecycle-operations";
import { getDatabaseRecord } from "../../services/databases/access/database-access";
import { pinnedResourceMiddleware } from "../auth/pinned-resource-middleware";
import { serverOperationContext } from "../http/operation-context";
import { attachServiceErrorHandler } from "../http/route-error";
import {
  createAutomation,
  createAutomationSecret,
  deleteAutomation,
  duplicateAutomation,
  listAutomations,
  readAutomation,
  readAutomationCapability,
  readAutomationCatalog,
  updateAutomation,
  validateAutomation,
} from "./definition/handlers";
import { exportAutomationAudit, listAutomationRuns, readAutomationRun } from "./history/handlers";

import type { AppBindings } from "../../shared/contracts/http";

export const databaseAutomationRoutes = attachServiceErrorHandler(new Hono<AppBindings>());
const resourceWorkspace = pinnedResourceMiddleware(
  (id) => getDatabaseRecord(id, { includeDeleted: true }),
  "databaseId",
);

databaseAutomationRoutes.get(
  "/:databaseId/automation-capability",
  resourceWorkspace,
  readAutomationCapability,
);

databaseAutomationRoutes.get("/:databaseId/automations", resourceWorkspace, listAutomations);

databaseAutomationRoutes.post(
  "/:databaseId/automations/validate",
  resourceWorkspace,
  validateAutomation,
);

databaseAutomationRoutes.post(
  "/:databaseId/automation-secrets",
  resourceWorkspace,
  createAutomationSecret,
);

databaseAutomationRoutes.post("/:databaseId/automations", resourceWorkspace, createAutomation);

databaseAutomationRoutes.get(
  "/:databaseId/automations/audit",
  resourceWorkspace,
  exportAutomationAudit,
);

databaseAutomationRoutes.get(
  "/:databaseId/automations/:automationId",
  resourceWorkspace,
  readAutomation,
);

databaseAutomationRoutes.get(
  "/:databaseId/automations/:automationId/runs",
  resourceWorkspace,
  listAutomationRuns,
);

databaseAutomationRoutes.get(
  "/:databaseId/automations/:automationId/runs/:runId",
  resourceWorkspace,
  readAutomationRun,
);

databaseAutomationRoutes.patch(
  "/:databaseId/automations/:automationId",
  resourceWorkspace,
  updateAutomation,
);

for (const [path, paused] of [
  ["pause", true],
  ["resume", false],
] as const) {
  databaseAutomationRoutes.post(
    `/:databaseId/automations/:automationId/${path}`,
    resourceWorkspace,
    async (c) =>
      c.json(
        await setAutomationPausedOperation(serverOperationContext(c), {
          databaseId: c.req.param("databaseId")!,
          paused: paused,
          automationId: c.req.param("automationId")!,
        }),
        200,
      ),
  );
}

databaseAutomationRoutes.post(
  "/:databaseId/automations/:automationId/duplicate",
  resourceWorkspace,
  duplicateAutomation,
);

databaseAutomationRoutes.delete(
  "/:databaseId/automations/:automationId",
  resourceWorkspace,
  deleteAutomation,
);

databaseAutomationRoutes.get(
  "/:databaseId/automation-catalog",
  resourceWorkspace,
  readAutomationCatalog,
);
