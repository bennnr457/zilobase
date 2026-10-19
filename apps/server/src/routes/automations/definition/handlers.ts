import type { Handler } from "hono";
import {
  createAutomationOperation,
  createAutomationSecretOperation,
  deleteAutomationOperation,
  duplicateAutomationOperation,
  listAutomationsOperation,
  readAutomationCapabilityOperation,
  readAutomationCatalogOperation,
  readAutomationOperation,
  updateAutomationOperation,
  validateAutomationOperation,
} from "../../../services/automations/definition/operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
export const readAutomationCapability: Handler<
  AppBindings,
  "/:databaseId/automation-capability"
> = async (c) =>
  c.json(
    await readAutomationCapabilityOperation(serverOperationContext(c), {
      databaseId: c.req.param("databaseId")!,
      workspaceId: c.req.query("workspaceId"),
    }),
    200,
  );

export const listAutomations: Handler<AppBindings, "/:databaseId/automations"> = async (c) =>
  c.json(
    await listAutomationsOperation(serverOperationContext(c), {
      databaseId: c.req.param("databaseId")!,
      dataSourceId: c.req.query("dataSourceId"),
    }),
    200,
  );

export const validateAutomation: Handler<AppBindings, "/:databaseId/automations/validate"> = async (
  c,
) =>
  c.json(
    await validateAutomationOperation(
      serverOperationContext(c),
      { databaseId: c.req.param("databaseId")! },
      () => c.req.json(),
    ),
    200,
  );

export const createAutomationSecret: Handler<
  AppBindings,
  "/:databaseId/automation-secrets"
> = async (c) =>
  c.json(
    await createAutomationSecretOperation(
      serverOperationContext(c),
      { databaseId: c.req.param("databaseId")! },
      () => c.req.json(),
    ),
    200,
  );

export const createAutomation: Handler<AppBindings, "/:databaseId/automations"> = async (c) => {
  const result = await createAutomationOperation(
    serverOperationContext(c),
    {
      databaseId: c.req.param("databaseId")!,
      headerIdempotencyKey: c.req.header("Idempotency-Key"),
    },
    () => c.req.json(),
  );
  return c.json(result.automation, result.created ? 201 : 200);
};

export const readAutomation: Handler<
  AppBindings,
  "/:databaseId/automations/:automationId"
> = async (c) =>
  c.json(
    await readAutomationOperation(serverOperationContext(c), {
      databaseId: c.req.param("databaseId")!,
      automationId: c.req.param("automationId")!,
    }),
    200,
  );

export const updateAutomation: Handler<
  AppBindings,
  "/:databaseId/automations/:automationId"
> = async (c) =>
  c.json(
    await updateAutomationOperation(
      serverOperationContext(c),
      {
        databaseId: c.req.param("databaseId")!,
        headerIfMatch: c.req.header("If-Match"),
        automationId: c.req.param("automationId")!,
      },
      () => c.req.json(),
    ),
    200,
  );

export const duplicateAutomation: Handler<
  AppBindings,
  "/:databaseId/automations/:automationId/duplicate"
> = async (c) => {
  const result = await duplicateAutomationOperation(serverOperationContext(c), {
    databaseId: c.req.param("databaseId")!,
    headerIdempotencyKey: c.req.header("Idempotency-Key"),
    automationId: c.req.param("automationId")!,
  });
  return c.json(result.automation, result.created ? 201 : 200);
};

export const deleteAutomation: Handler<
  AppBindings,
  "/:databaseId/automations/:automationId"
> = async (c) =>
  c.json(
    await deleteAutomationOperation(serverOperationContext(c), {
      databaseId: c.req.param("databaseId")!,
      automationId: c.req.param("automationId")!,
    }),
    200,
  );

export const readAutomationCatalog: Handler<
  AppBindings,
  "/:databaseId/automation-catalog"
> = async (c) =>
  c.json(
    await readAutomationCatalogOperation(serverOperationContext(c), {
      databaseId: c.req.param("databaseId")!,
      dataSourceId: c.req.query("dataSourceId"),
    }),
    200,
  );
