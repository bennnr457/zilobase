import {
  createDatabaseAutomationRequestSchema,
  createDatabaseAutomationSecretRequestSchema,
  updateDatabaseAutomationRequestSchema,
  validateDatabaseAutomationRequestSchema,
} from "@zilobase/features/runtime";
import { getMembership } from "../../access/principal-access";
import {
  requireOperationPolicy,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import {
  isAutomationSlackEnabled,
  isAutomationWebhooksEnabled,
  isDatabaseAutomationsFeatureEnabled,
} from "../configuration";
import {
  invalidBody,
  parseIfMatch,
  requireAutomationDatabaseWorkspace,
  requireAutomationSource,
  requireIdempotencyKey,
  webhookHttpDomains,
} from "../operation-support";
import { getDatabaseAutomationCatalog } from "./definition-catalog";
import {
  createDatabaseAutomation,
  createDatabaseAutomationSecret,
  deleteDatabaseAutomation,
  duplicateDatabaseAutomation,
  updateDatabaseAutomation,
} from "./definition-lifecycle";
import { getDatabaseAutomation, listDatabaseAutomations } from "./definition-read";
import { validateDatabaseAutomation } from "./definition-validation";

export type ReadAutomationCapabilityOperationInput = { databaseId: string; workspaceId?: string };
export async function readAutomationCapabilityOperation(
  context: ServerOperationContext,
  operationInput: ReadAutomationCapabilityOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  const workspaceId = operationInput.workspaceId?.trim();
  if (!workspaceId) return deny({ error: "workspaceId is required" }, 400);
  if (!(await getMembership(workspaceId, user.id))) {
    return deny({ error: "Forbidden" }, 403);
  }
  return {
    enabled: isDatabaseAutomationsFeatureEnabled(context.env),
  };
}

export type ListAutomationsOperationInput = { databaseId: string; dataSourceId?: string };
export async function listAutomationsOperation(
  context: ServerOperationContext,
  operationInput: ListAutomationsOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const source = requireAutomationSource(context, operationInput.dataSourceId);

  const { user, dataSourceId } = source;
  return (() =>
    listDatabaseAutomations({
      databaseId: operationInput.databaseId,
      dataSourceId,
      userId: user.id,
    }))();
}

export type ValidateAutomationOperationInput = { databaseId: string; body?: unknown };
export async function validateAutomationOperation(
  context: ServerOperationContext,
  operationInput: ValidateAutomationOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  const parsed = validateDatabaseAutomationRequestSchema.safeParse(
    await readBody().catch(() => null),
  );
  if (!parsed.success) return invalidBody(parsed.error.issues);
  return (() =>
    validateDatabaseAutomation({
      allowHttpWebhookDomains: webhookHttpDomains(context),
      databaseId: operationInput.databaseId,
      dataSourceId: parsed.data.dataSourceId,
      definition: parsed.data.definition,
      slackEnabled: isAutomationSlackEnabled(context.env ?? {}),
      webhooksEnabled: isAutomationWebhooksEnabled(context.env ?? {}),
      userId: user.id,
    }))();
}

export type CreateAutomationSecretOperationInput = { databaseId: string; body?: unknown };
export async function createAutomationSecretOperation(
  context: ServerOperationContext,
  operationInput: CreateAutomationSecretOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  const parsed = createDatabaseAutomationSecretRequestSchema.safeParse(
    await readBody().catch(() => null),
  );
  if (!parsed.success) return invalidBody(parsed.error.issues);
  return (() =>
    createDatabaseAutomationSecret({
      body: parsed.data,
      databaseId: operationInput.databaseId,
      env: context.env ?? {},
      userId: user.id,
      webhooksEnabled: isAutomationWebhooksEnabled(context.env ?? {}),
    }))();
}

export type CreateAutomationOperationInput = {
  databaseId: string;
  headerIdempotencyKey?: string;
  body?: unknown;
};
export async function createAutomationOperation(
  context: ServerOperationContext,
  operationInput: CreateAutomationOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  const parsed = createDatabaseAutomationRequestSchema.safeParse(
    await readBody().catch(() => null),
  );
  if (!parsed.success) return invalidBody(parsed.error.issues);
  const idempotencyKey = requireIdempotencyKey(
    operationInput.headerIdempotencyKey,
    parsed.data.idempotencyKey,
  );
  if (!idempotencyKey.ok) return deny(idempotencyKey.error, 400);
  return (async () => {
    const result = await createDatabaseAutomation({
      allowHttpWebhookDomains: webhookHttpDomains(context),
      body: { ...parsed.data, idempotencyKey: idempotencyKey.value },
      databaseId: operationInput.databaseId,
      editionExtension: context.editionExtension ?? undefined,
      slackEnabled: isAutomationSlackEnabled(context.env ?? {}),
      webhooksEnabled: isAutomationWebhooksEnabled(context.env ?? {}),
      userId: user.id,
    });
    return result;
  })();
}

export type ReadAutomationOperationInput = { databaseId: string; automationId: string };
export async function readAutomationOperation(
  context: ServerOperationContext,
  operationInput: ReadAutomationOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  return (() =>
    getDatabaseAutomation({
      automationId: operationInput.automationId,
      databaseId: operationInput.databaseId,
      userId: user.id,
    }))();
}

export type UpdateAutomationOperationInput = {
  databaseId: string;
  headerIfMatch?: string;
  automationId: string;
  body?: unknown;
};
export async function updateAutomationOperation(
  context: ServerOperationContext,
  operationInput: UpdateAutomationOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  const expectedVersion = parseIfMatch(operationInput.headerIfMatch);
  if (expectedVersion === null) {
    return deny(
      {
        code: "AUTOMATION_IF_MATCH_REQUIRED",
        error: "If-Match must contain the current revision version",
      },
      428,
    );
  }
  const parsed = updateDatabaseAutomationRequestSchema.safeParse(
    await readBody().catch(() => null),
  );
  if (!parsed.success) return invalidBody(parsed.error.issues);
  return (() =>
    updateDatabaseAutomation({
      allowHttpWebhookDomains: webhookHttpDomains(context),
      automationId: operationInput.automationId,
      body: parsed.data,
      databaseId: operationInput.databaseId,
      editionExtension: context.editionExtension ?? undefined,
      expectedVersion,
      slackEnabled: isAutomationSlackEnabled(context.env ?? {}),
      webhooksEnabled: isAutomationWebhooksEnabled(context.env ?? {}),
      userId: user.id,
    }))();
}

export type DuplicateAutomationOperationInput = {
  databaseId: string;
  headerIdempotencyKey?: string;
  automationId: string;
};
export async function duplicateAutomationOperation(
  context: ServerOperationContext,
  operationInput: DuplicateAutomationOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  const idempotencyKey = operationInput.headerIdempotencyKey?.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return deny(
      {
        code: "AUTOMATION_IDEMPOTENCY_KEY_REQUIRED",
        error: "A valid Idempotency-Key header is required",
      },
      400,
    );
  }
  return (async () => {
    const result = await duplicateDatabaseAutomation({
      allowHttpWebhookDomains: webhookHttpDomains(context),
      automationId: operationInput.automationId,
      databaseId: operationInput.databaseId,
      editionExtension: context.editionExtension ?? undefined,
      idempotencyKey,
      slackEnabled: isAutomationSlackEnabled(context.env ?? {}),
      webhooksEnabled: isAutomationWebhooksEnabled(context.env ?? {}),
      userId: user.id,
    });
    return result;
  })();
}

export type DeleteAutomationOperationInput = { databaseId: string; automationId: string };
export async function deleteAutomationOperation(
  context: ServerOperationContext,
  operationInput: DeleteAutomationOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  return (() =>
    deleteDatabaseAutomation({
      automationId: operationInput.automationId,
      databaseId: operationInput.databaseId,
      editionExtension: context.editionExtension ?? undefined,
      userId: user.id,
    }))();
}

export type ReadAutomationCatalogOperationInput = { databaseId: string; dataSourceId?: string };
export async function readAutomationCatalogOperation(
  context: ServerOperationContext,
  operationInput: ReadAutomationCatalogOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const source = requireAutomationSource(context, operationInput.dataSourceId);

  const { user, dataSourceId } = source;
  return (() =>
    getDatabaseAutomationCatalog({
      databaseId: operationInput.databaseId,
      dataSourceId,
      slackEnabled: isAutomationSlackEnabled(context.env ?? {}),
      webhooksEnabled: isAutomationWebhooksEnabled(context.env ?? {}),
      userId: user.id,
    }))();
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
