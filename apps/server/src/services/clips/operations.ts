import {
  isClipCaptureMode,
  isClipDuplicateStrategy,
  type CreateClipRequest,
} from "@zilobase/features/runtime";
import { ServiceMutationError } from "../../shared/errors/service-mutation-error";
import {
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { createClipService, findDuplicateClip } from "./create-clip-service";
function parseCreateClipRequest(body: Record<string, unknown>):
  | {
      ok: true;
      value: CreateClipRequest;
    }
  | {
      ok: false;
      error: string;
    } {
  const workspaceId = body.workspaceId;
  const title = body.title;
  const sourceUrl = body.sourceUrl;
  const captureMode = body.captureMode;
  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    return { ok: false, error: "workspaceId is required" };
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    return { ok: false, error: "title is required" };
  }
  if (typeof sourceUrl !== "string" || !/^https?:\/\//i.test(sourceUrl)) {
    return { ok: false, error: "sourceUrl must be an http(s) URL" };
  }
  if (!isClipCaptureMode(captureMode)) {
    return { ok: false, error: "captureMode is invalid" };
  }
  const optionalError = validateOptionalClipFields(body);
  if (optionalError) return { ok: false, error: optionalError };
  return {
    ok: true,
    value: {
      workspaceId,
      title: title.trim(),
      sourceUrl,
      captureMode,
      ...optionalClipFields(body),
    },
  };
}

function validateOptionalClipFields(body: Record<string, unknown>): string | null {
  for (const field of ["parentPageId", "databaseId"]) {
    if (body[field] != null && typeof body[field] !== "string")
      return `${field} must be a string or null`;
  }
  if (body.duplicateStrategy != null && !isClipDuplicateStrategy(body.duplicateStrategy))
    return "duplicateStrategy is invalid";
  for (const field of ["html", "note"]) {
    if (body[field] != null && typeof body[field] !== "string") return `${field} must be a string`;
  }
  return null;
}

function optionalClipFields(body: Record<string, unknown>) {
  return {
    parentPageId: (body.parentPageId as string | null | undefined) ?? null,
    databaseId: (body.databaseId as string | null | undefined) ?? null,
    teamspaceId: nullableString(body.teamspaceId),
    canonicalUrl: nullableString(body.canonicalUrl),
    note: nullableString(body.note),
    html: nullableString(body.html),
    content: body.content ?? null,
    metadata:
      body.metadata && typeof body.metadata === "object"
        ? (body.metadata as CreateClipRequest["metadata"])
        : undefined,
    duplicateStrategy: isClipDuplicateStrategy(body.duplicateStrategy)
      ? body.duplicateStrategy
      : "create",
  };
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export type CreateClipOperationInput = { body?: unknown };
export async function createClipOperation(
  context: ServerOperationContext,
  operationInput: CreateClipOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "clips.write" });

  const request = await readOperationAuthenticatedJson(context, readBody);

  const parsed = parseCreateClipRequest(request.body as Record<string, unknown>);
  if (!parsed.ok) {
    return deny({ error: parsed.error }, 400);
  }
  requireOperationWorkspace(context, parsed.value.workspaceId);

  try {
    const result = await createClipService({
      env: context.env,
      request: parsed.value,
      userId: request.user.id,
    });
    return result;
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return deny({ error: error.message }, error.status as 400 | 403 | 409);
    }
    throw error;
  }
}

export type FindDuplicateClipOperationInput = { workspaceId?: string; url?: string };
export async function findDuplicateClipOperation(
  context: ServerOperationContext,
  operationInput: FindDuplicateClipOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: "clips.write" });

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  const workspaceId = operationInput.workspaceId?.trim();
  const url = operationInput.url?.trim();
  if (!workspaceId || !url) {
    return deny({ error: "workspaceId and url are required" }, 400);
  }
  requireOperationWorkspace(context, workspaceId);

  const duplicate = await findDuplicateClip({
    sourceUrl: url,
    userId: user.id,
    workspaceId,
  });
  if (!duplicate) {
    return { duplicate: null };
  }
  return {
    duplicate: {
      pageId: duplicate.pageId,
      title: duplicate.title,
      url: `/p/${duplicate.pageId}`,
    },
  };
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
function operationValue<T>(body: T, status: number): T {
  if (status >= 400) throw new ServerOperationError(body as Record<string, unknown>, status);
  return body;
}

async function readOperationAuthenticatedJson(
  context: ServerOperationContext,
  readBody: () => Promise<unknown>,
) {
  const user = context.authentication.user;
  if (!user) throw new ServerOperationError({ error: "Unauthorized" }, 401);
  const body = await readBody().catch(() => null);
  if (!body || typeof body !== "object")
    throw new ServerOperationError({ error: "A JSON body is required" }, 400);
  return { ok: true as const, user, body };
}
