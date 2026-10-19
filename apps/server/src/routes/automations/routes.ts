import { Hono } from "hono";
import { getDatabaseRecord } from "../../services/databases/access/database-access";
import { pinnedResourceMiddleware } from "../auth/pinned-resource-middleware";
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
import { handle, webhookHttpDomains } from "./support";

import {
  isAutomationSlackEnabled,
  isAutomationWebhooksEnabled,
} from "../../services/automations/configuration";
import { setDatabaseAutomationPaused } from "../../services/automations/definition/definition-lifecycle";
import type { AppBindings } from "../../shared/contracts/http";
import { requireDatabaseRouteUser } from "../databases/support";

export const databaseAutomationRoutes = new Hono<AppBindings>();
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
    async (c) => {
      const user = requireDatabaseRouteUser(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      return handle(c, () =>
        setDatabaseAutomationPaused({
          allowHttpWebhookDomains: webhookHttpDomains(c),
          automationId: c.req.param("automationId"),
          databaseId: c.req.param("databaseId"),
          editionExtension: c.get("editionExtension") ?? undefined,
          slackEnabled: isAutomationSlackEnabled(c.env ?? {}),
          webhooksEnabled: isAutomationWebhooksEnabled(c.env ?? {}),
          paused,
          userId: user.id,
        }),
      );
    },
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
