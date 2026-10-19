import {
  createDatabaseAutomationRequestSchema,
  createDatabaseAutomationSecretRequestSchema,
  updateDatabaseAutomationRequestSchema,
  validateDatabaseAutomationRequestSchema,
} from "@zilobase/features/runtime";
import type { Handler } from "hono";
import { getMembership } from "../../../services/access/principal-access";
import {
  isAutomationSlackEnabled,
  isAutomationWebhooksEnabled,
  isDatabaseAutomationsFeatureEnabled,
} from "../../../services/automations/configuration";
import { getDatabaseAutomationCatalog } from "../../../services/automations/definition/definition-catalog";
import {
  createDatabaseAutomation,
  createDatabaseAutomationSecret,
  deleteDatabaseAutomation,
  duplicateDatabaseAutomation,
  updateDatabaseAutomation,
} from "../../../services/automations/definition/definition-lifecycle";
import {
  getDatabaseAutomation,
  listDatabaseAutomations,
} from "../../../services/automations/definition/definition-read";
import { validateDatabaseAutomation } from "../../../services/automations/definition/definition-validation";
import type { AppBindings } from "../../../shared/contracts/http";
import { requireDatabaseRouteUser } from "../../databases/support";
import { readJsonBody } from "../../http/request";
import {
  handle,
  invalidBody,
  parseIfMatch,
  requireAutomationSource,
  requireIdempotencyKey,
  webhookHttpDomains,
} from "../support";
export const readAutomationCapability: Handler<
  AppBindings,
  "/:databaseId/automation-capability"
> = async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const workspaceId = c.req.query("workspaceId")?.trim();
  if (!workspaceId) return c.json({ error: "workspaceId is required" }, 400);
  if (!(await getMembership(workspaceId, user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return c.json({
    enabled: isDatabaseAutomationsFeatureEnabled(c.env),
  });
};

export const listAutomations: Handler<AppBindings, "/:databaseId/automations"> = async (c) => {
  const source = requireAutomationSource(c);
  if (!source.ok) return source.response;
  const { user, dataSourceId } = source;

  return handle(c, () =>
    listDatabaseAutomations({
      databaseId: c.req.param("databaseId"),
      dataSourceId,
      userId: user.id,
    }),
  );
};

export const validateAutomation: Handler<AppBindings, "/:databaseId/automations/validate"> = async (
  c,
) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const parsed = validateDatabaseAutomationRequestSchema.safeParse(await readJsonBody(c.req));
  if (!parsed.success) return invalidBody(c, parsed.error.issues);

  return handle(c, () =>
    validateDatabaseAutomation({
      allowHttpWebhookDomains: webhookHttpDomains(c),
      databaseId: c.req.param("databaseId"),
      dataSourceId: parsed.data.dataSourceId,
      definition: parsed.data.definition,
      slackEnabled: isAutomationSlackEnabled(c.env ?? {}),
      webhooksEnabled: isAutomationWebhooksEnabled(c.env ?? {}),
      userId: user.id,
    }),
  );
};

export const createAutomationSecret: Handler<
  AppBindings,
  "/:databaseId/automation-secrets"
> = async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const parsed = createDatabaseAutomationSecretRequestSchema.safeParse(await readJsonBody(c.req));
  if (!parsed.success) return invalidBody(c, parsed.error.issues);
  return handle(c, () =>
    createDatabaseAutomationSecret({
      body: parsed.data,
      databaseId: c.req.param("databaseId"),
      env: c.env ?? {},
      userId: user.id,
      webhooksEnabled: isAutomationWebhooksEnabled(c.env ?? {}),
    }),
  );
};

export const createAutomation: Handler<AppBindings, "/:databaseId/automations"> = async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const parsed = createDatabaseAutomationRequestSchema.safeParse(await readJsonBody(c.req));
  if (!parsed.success) return invalidBody(c, parsed.error.issues);
  const idempotencyKey = requireIdempotencyKey(
    c.req.header("Idempotency-Key"),
    parsed.data.idempotencyKey,
  );
  if (!idempotencyKey.ok) return c.json(idempotencyKey.error, 400);

  return handle(
    c,
    async () => {
      const result = await createDatabaseAutomation({
        allowHttpWebhookDomains: webhookHttpDomains(c),
        body: { ...parsed.data, idempotencyKey: idempotencyKey.value },
        databaseId: c.req.param("databaseId"),
        editionExtension: c.get("editionExtension") ?? undefined,
        slackEnabled: isAutomationSlackEnabled(c.env ?? {}),
        webhooksEnabled: isAutomationWebhooksEnabled(c.env ?? {}),
        userId: user.id,
      });
      return c.json(result.automation, result.created ? 201 : 200);
    },
    true,
  );
};

export const readAutomation: Handler<
  AppBindings,
  "/:databaseId/automations/:automationId"
> = async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return handle(c, () =>
    getDatabaseAutomation({
      automationId: c.req.param("automationId"),
      databaseId: c.req.param("databaseId"),
      userId: user.id,
    }),
  );
};

export const updateAutomation: Handler<
  AppBindings,
  "/:databaseId/automations/:automationId"
> = async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const expectedVersion = parseIfMatch(c.req.header("If-Match"));
  if (expectedVersion === null) {
    return c.json(
      {
        code: "AUTOMATION_IF_MATCH_REQUIRED",
        error: "If-Match must contain the current revision version",
      },
      428,
    );
  }
  const parsed = updateDatabaseAutomationRequestSchema.safeParse(await readJsonBody(c.req));
  if (!parsed.success) return invalidBody(c, parsed.error.issues);
  return handle(c, () =>
    updateDatabaseAutomation({
      allowHttpWebhookDomains: webhookHttpDomains(c),
      automationId: c.req.param("automationId"),
      body: parsed.data,
      databaseId: c.req.param("databaseId"),
      editionExtension: c.get("editionExtension") ?? undefined,
      expectedVersion,
      slackEnabled: isAutomationSlackEnabled(c.env ?? {}),
      webhooksEnabled: isAutomationWebhooksEnabled(c.env ?? {}),
      userId: user.id,
    }),
  );
};

export const duplicateAutomation: Handler<
  AppBindings,
  "/:databaseId/automations/:automationId/duplicate"
> = async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const idempotencyKey = c.req.header("Idempotency-Key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return c.json(
      {
        code: "AUTOMATION_IDEMPOTENCY_KEY_REQUIRED",
        error: "A valid Idempotency-Key header is required",
      },
      400,
    );
  }
  return handle(
    c,
    async () => {
      const result = await duplicateDatabaseAutomation({
        allowHttpWebhookDomains: webhookHttpDomains(c),
        automationId: c.req.param("automationId"),
        databaseId: c.req.param("databaseId"),
        editionExtension: c.get("editionExtension") ?? undefined,
        idempotencyKey,
        slackEnabled: isAutomationSlackEnabled(c.env ?? {}),
        webhooksEnabled: isAutomationWebhooksEnabled(c.env ?? {}),
        userId: user.id,
      });
      return c.json(result.automation, result.created ? 201 : 200);
    },
    true,
  );
};

export const deleteAutomation: Handler<
  AppBindings,
  "/:databaseId/automations/:automationId"
> = async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return handle(c, () =>
    deleteDatabaseAutomation({
      automationId: c.req.param("automationId"),
      databaseId: c.req.param("databaseId"),
      editionExtension: c.get("editionExtension") ?? undefined,
      userId: user.id,
    }),
  );
};

export const readAutomationCatalog: Handler<
  AppBindings,
  "/:databaseId/automation-catalog"
> = async (c) => {
  const source = requireAutomationSource(c);
  if (!source.ok) return source.response;
  const { user, dataSourceId } = source;
  return handle(c, () =>
    getDatabaseAutomationCatalog({
      databaseId: c.req.param("databaseId"),
      dataSourceId,
      slackEnabled: isAutomationSlackEnabled(c.env ?? {}),
      webhooksEnabled: isAutomationWebhooksEnabled(c.env ?? {}),
      userId: user.id,
    }),
  );
};
