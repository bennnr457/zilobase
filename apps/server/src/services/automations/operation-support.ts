import { isCommunityRegistration } from "../../shared/config/app-policy";
import { getDatabaseRecord } from "../databases/access/database-access";
import {
  requireOperationActor,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { getAutomationWebhookHttpDomains } from "./configuration";
export function webhookHttpDomains(context: ServerOperationContext) {
  return isCommunityRegistration(context.policy)
    ? getAutomationWebhookHttpDomains(context.env ?? {})
    : new Set<string>();
}
export async function requireAutomationDatabaseWorkspace(
  context: ServerOperationContext,
  databaseId: string,
) {
  if (!context.pinnedWorkspaceId) return;
  const record = await getDatabaseRecord(databaseId, { includeDeleted: true });
  if (!record) throw new ServerOperationError({ error: "Resource not found" }, 404);
  requireOperationWorkspace(context, record.workspaceId);
}
export function invalidBody(issues: Array<{ message: string; path: PropertyKey[] }>): never {
  throw new ServerOperationError(
    {
      code: "AUTOMATION_INVALID_REQUEST",
      error: "Request body is invalid",
      validation: {
        errors: issues.map((issue) => ({
          code: "invalid_request",
          message: issue.message,
          path: issue.path.map(String),
        })),
        valid: false,
        warnings: [],
      },
    },
    400,
  );
}
export function requireAutomationSource(
  context: ServerOperationContext,
  sourceId: string | undefined,
) {
  const user = requireOperationActor(context),
    dataSourceId = sourceId?.trim();
  if (!dataSourceId)
    throw new ServerOperationError(
      { code: "AUTOMATION_SOURCE_REQUIRED", error: "dataSourceId is required" },
      400,
    );
  return { ok: true as const, user, dataSourceId };
}
export function requireIdempotencyKey(header: string | undefined, body: string) {
  const value = header?.trim();
  if (!value || value.length > 200) {
    return {
      ok: false as const,
      error: {
        code: "AUTOMATION_IDEMPOTENCY_KEY_REQUIRED",
        error: "A valid Idempotency-Key header is required",
      },
    };
  }
  if (value !== body) {
    return {
      ok: false as const,
      error: {
        code: "AUTOMATION_IDEMPOTENCY_KEY_MISMATCH",
        error: "Idempotency-Key must match body.idempotencyKey",
      },
    };
  }
  return { ok: true as const, value };
}

export function parseIfMatch(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim().replace(/^W\//, "").replace(/^"|"$/g, "");
  return /^\d+$/.test(normalized) && Number(normalized) > 0 ? Number(normalized) : null;
}
