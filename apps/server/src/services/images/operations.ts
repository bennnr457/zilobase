import { canAccessPageInWorkspace } from "../access/effective-access";
import { getPageRecord } from "../access/resource-access-records";
import {
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import {
  getActiveImageAsset,
  getReadableImageAsset,
  isWorkspaceDatabase,
} from "./access/image-access";
import { getImageUploadMaxBytes } from "./configuration";
import {
  normalizeContentType,
  readPositiveInteger,
  readString,
  sanitizeFilename,
} from "./image-upload-input";
import { getImageReadUrl } from "./read/image-read";
import { completeImageUpload, createImageUpload, deleteImageAsset } from "./uploads/image-uploads";
const allowedImageContentTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
type CreateUploadBody = {
  byteSize?: unknown;
  contentType?: unknown;
  databaseId?: unknown;
  filename?: unknown;
  workspaceId?: unknown;
  pageId?: unknown;
};

export async function requireImagePageAccess(
  context: ServerOperationContext,
  asset: NonNullable<Awaited<ReturnType<typeof getActiveImageAsset>>>,
  required: "view" | "edit",
) {
  requireOperationWorkspace(context, asset.workspaceId);

  const user = context.authentication.user;
  if (!user) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const page = await getPageRecord(asset.pageId);
  if (!page || page.workspaceId !== asset.workspaceId) {
    return deny({ error: "Page not found" }, 404);
  }
  if (!(await canAccessPageInWorkspace(asset.pageId, asset.workspaceId, user.id, required))) {
    return deny({ error: "Forbidden" }, 403);
  }
  return null;
}

export type CreateImageUploadOperationInput = { body?: unknown };
export async function createImageUploadOperation(
  context: ServerOperationContext,
  operationInput: CreateImageUploadOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });

  const user = context.authentication.user;
  if (!user) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const body = (await readBody().catch(() => null)) as CreateUploadBody | null;
  if (!body) {
    return deny({ error: "Request body must be valid JSON" }, 400);
  }
  const workspaceId = readString(body.workspaceId);
  const pageId = readString(body.pageId);
  const filename = sanitizeFilename(readString(body.filename) ?? "image");
  const contentType = normalizeContentType(readString(body.contentType));
  const byteSize = readPositiveInteger(body.byteSize);
  const databaseId = readString(body.databaseId);
  if (!workspaceId || !pageId) {
    return deny({ error: "workspaceId and pageId are required" }, 400);
  }
  requireOperationWorkspace(context, workspaceId);

  if (!contentType || !allowedImageContentTypes.has(contentType)) {
    return deny({ error: "A supported image contentType is required" }, 400);
  }
  const maxBytes = getImageUploadMaxBytes(context.env);
  if (!byteSize || byteSize > maxBytes) {
    return deny({ error: `byteSize must be between 1 and ${maxBytes}` }, 400);
  }
  const page = await getPageRecord(pageId);
  if (!page || page.workspaceId !== workspaceId) {
    return deny({ error: "Page not found" }, 404);
  }
  if (!(await canAccessPageInWorkspace(pageId, workspaceId, user.id, "edit"))) {
    return deny({ error: "Forbidden" }, 403);
  }
  if (databaseId && !(await isWorkspaceDatabase(databaseId, workspaceId))) {
    return deny({ error: "Database not found" }, 404);
  }
  return await createImageUpload(
    { workspaceId, pageId, filename, contentType, byteSize, databaseId, userId: user.id },
    context.env,
  );
}

export type CompleteImageUploadOperationInput = { assetId: string };
export async function completeImageUploadOperation(
  context: ServerOperationContext,
  operationInput: CompleteImageUploadOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });

  const user = context.authentication.user;
  if (!user) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const asset = await getActiveImageAsset(operationInput.assetId);
  if (!asset) {
    return deny({ error: "Image asset not found" }, 404);
  }
  const forbidden = await requireImagePageAccess(context, asset, "edit");
  if (forbidden) {
    return forbidden;
  }
  return await completeImageUpload(asset, context.env);
}

export type GetImageUrlOperationInput = { assetId: string };
export async function getImageUrlOperation(
  context: ServerOperationContext,
  operationInput: GetImageUrlOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });

  const user = context.authentication.user;
  if (!user) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const asset = await getReadableImageAsset(operationInput.assetId);
  if (!asset) {
    return deny({ error: "Image asset not found" }, 404);
  }
  const forbidden = await requireImagePageAccess(context, asset, "view");
  if (forbidden) {
    return forbidden;
  }
  return await getImageReadUrl(asset, context.env);
}

export type RemoveImageOperationInput = { assetId: string };
export async function removeImageOperation(
  context: ServerOperationContext,
  operationInput: RemoveImageOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });

  const user = context.authentication.user;
  if (!user) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const asset = await getActiveImageAsset(operationInput.assetId);
  if (!asset) {
    return deny({ error: "Image asset not found" }, 404);
  }
  const forbidden = await requireImagePageAccess(context, asset, "edit");
  if (forbidden) {
    return forbidden;
  }
  await deleteImageAsset(asset, context.env);
  return { ok: true };
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
