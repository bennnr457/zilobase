import { normalizeAccessLevel } from "../../access/access-level";
import {
  requireOperationPolicy,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import {
  getPageAccessRules,
  getPageAccessTargets,
  grantPageAccess,
  removePageAccessRule,
  removePublicPageAccess,
} from "../../pages/sharing/page-sharing";
import { authorizePageOperation, requirePageOperationWorkspace } from "../access";

export type GetAccessPageInput = { pageId: string };
export async function getAccessPageOperation(
  context: ServerOperationContext,
  input: GetAccessPageInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: "pages.read" });
  await requirePageOperationWorkspace(context, input.pageId);

  const authorization = await authorizePageOperation(context, input.pageId, "full");
  const { record } = authorization;

  const rules = await getPageAccessRules(record.id);
  return { access: rules };
}

export type GetAccessTargetsPageInput = { pageId: string };
export async function getAccessTargetsPageOperation(
  context: ServerOperationContext,
  input: GetAccessTargetsPageInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: "pages.read" });
  await requirePageOperationWorkspace(context, input.pageId);

  const authorization = await authorizePageOperation(context, input.pageId, "view");
  const { record } = authorization;

  return await getPageAccessTargets(record);
}

export type UpsertAccessPageInput = { pageId: string; body: unknown };
export async function upsertAccessPageOperation(
  context: ServerOperationContext,
  input: UpsertAccessPageInput,
  readBody?: () => Promise<unknown>,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);

  const authorization = await authorizePageOperation(context, input.pageId, "full");
  const { record } = authorization;

  const body = readBody ? await readBody() : input.body;

  if (!body || typeof body !== "object") {
    return deny({ error: "A JSON body is required" }, 400);
  }

  const { targetType, targetId, accessLevel } = body as {
    accessLevel?: unknown;
    targetId?: unknown;
    targetType?: unknown;
  };
  const normalizedAccessLevel = normalizeAccessLevel(accessLevel);

  if (!isPageAccessTarget(targetType)) {
    return deny({ error: "targetType must be public, user, or team" }, 400);
  }

  if (typeof targetId !== "string" || targetId.length === 0) {
    return deny({ error: "targetId is required" }, 400);
  }

  if (!normalizedAccessLevel) {
    return deny({ error: "accessLevel must be view, comment, edit, or full" }, 400);
  }

  return await grantPageAccess(record, targetType, targetId, normalizedAccessLevel);
}

export type RemovePublicAccessPageInput = { pageId: string };
export async function removePublicAccessPageOperation(
  context: ServerOperationContext,
  input: RemovePublicAccessPageInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);

  const authorization = await authorizePageOperation(context, input.pageId, "full");
  const { record } = authorization;

  const rule = await removePublicPageAccess(record.id);
  return { access: rule ?? null };
}

export type RemoveAccessPageInput = { pageId: string; ruleId: string };
export async function removeAccessPageOperation(
  context: ServerOperationContext,
  input: RemoveAccessPageInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);

  const authorization = await authorizePageOperation(context, input.pageId, "full");
  const { record } = authorization;

  const rule = await removePageAccessRule(record.id, input.ruleId!);
  if (!rule) {
    return deny({ error: "Access rule not found" }, 404);
  }

  return { access: rule };
}

function isPageAccessTarget(value: unknown): value is "public" | "user" | "team" {
  return typeof value === "string" && ["public", "user", "team"].includes(value);
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
