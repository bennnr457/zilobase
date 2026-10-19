import type { Context } from "hono";
import { Hono } from "hono";
import { resolveImageStorageMode } from "../../infrastructure/storage/image-storage";
import { canAccessPageInWorkspace } from "../../services/access/effective-access";
import { getPageRecord } from "../../services/access/resource-access-records";
import {
  getActiveImageAsset,
  getReadableImageAsset,
  isWorkspaceDatabase,
} from "../../services/images/access/image-access";
import { getImageUploadMaxBytes } from "../../services/images/configuration";
import {
  normalizeContentType,
  readPositiveInteger,
  readString,
  sanitizeFilename,
} from "../../services/images/image-upload-input";
import { getImageReadUrl, readImageObject } from "../../services/images/read/image-read";
import {
  completeImageUpload,
  createImageUpload,
  deleteImageAsset,
  writeImageUpload,
} from "../../services/images/uploads/image-uploads";
import type { AppBindings } from "../../shared/contracts/http";
import { rejectMismatchedApiKeyWorkspace } from "../api-keys/access";
import { readJsonBody } from "../http/request";
import { attachServiceErrorHandler } from "../http/route-error";

export const imageRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

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

imageRoutes.post("/uploads", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = (await readJsonBody(c.req)) as CreateUploadBody | null;

  if (!body) {
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }

  const workspaceId = readString(body.workspaceId);
  const pageId = readString(body.pageId);
  const filename = sanitizeFilename(readString(body.filename) ?? "image");
  const contentType = normalizeContentType(readString(body.contentType));
  const byteSize = readPositiveInteger(body.byteSize);
  const databaseId = readString(body.databaseId);

  if (!workspaceId || !pageId) {
    return c.json({ error: "workspaceId and pageId are required" }, 400);
  }

  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  if (!contentType || !allowedImageContentTypes.has(contentType)) {
    return c.json({ error: "A supported image contentType is required" }, 400);
  }

  const maxBytes = getImageUploadMaxBytes(c.env);

  if (!byteSize || byteSize > maxBytes) {
    return c.json({ error: `byteSize must be between 1 and ${maxBytes}` }, 400);
  }

  const page = await getPageRecord(pageId);

  if (!page || page.workspaceId !== workspaceId) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(pageId, workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (databaseId && !(await isWorkspaceDatabase(databaseId, workspaceId))) {
    return c.json({ error: "Database not found" }, 404);
  }

  return c.json(
    await createImageUpload(
      { workspaceId, pageId, filename, contentType, byteSize, databaseId, userId: user.id },
      c.env,
    ),
  );
});

imageRoutes.put("/uploads/:assetId/body", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (resolveImageStorageMode(c.env) !== "binding") {
    return c.json({ error: "Server upload route is only available in binding mode" }, 409);
  }

  const asset = await getActiveImageAsset(c.req.param("assetId"));

  if (!asset) {
    return c.json({ error: "Image asset not found" }, 404);
  }

  const forbidden = await requirePageAccess(c, asset, "edit");

  if (forbidden) {
    return forbidden;
  }

  if (asset.status !== "pending") {
    return c.json({ error: "Image asset is not pending upload" }, 409);
  }

  const contentType = normalizeContentType(c.req.header("content-type"));

  if (contentType !== asset.contentType) {
    return c.json({ error: "Content-Type does not match upload request" }, 400);
  }

  const contentLength = readPositiveInteger(c.req.header("content-length"));

  if (contentLength && contentLength > asset.byteSize) {
    return c.json({ error: "Uploaded image is larger than expected" }, 413);
  }

  if (!c.req.raw.body) {
    return c.json({ error: "Image body is required" }, 400);
  }

  await writeImageUpload(asset, c.req.raw.body, c.env);

  return c.json({ ok: true });
});

imageRoutes.post("/uploads/:assetId/complete", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const asset = await getActiveImageAsset(c.req.param("assetId"));

  if (!asset) {
    return c.json({ error: "Image asset not found" }, 404);
  }

  const forbidden = await requirePageAccess(c, asset, "edit");

  if (forbidden) {
    return forbidden;
  }

  return c.json(await completeImageUpload(asset, c.env));
});

imageRoutes.get("/:assetId", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const asset = await getReadableImageAsset(c.req.param("assetId"));

  if (!asset) {
    return c.json({ error: "Image asset not found" }, 404);
  }

  const forbidden = await requirePageAccess(c, asset, "view");

  if (forbidden) {
    return forbidden;
  }

  const object = await readImageObject(asset.objectKey, c.env);

  if (!object) {
    return c.json({ error: "Image object not found" }, 404);
  }

  const headers = new Headers();

  headers.set("cache-control", "private, max-age=60");
  headers.set("content-disposition", getContentDisposition(c, asset.filename));
  headers.set("content-type", object.contentType ?? asset.contentType);

  if (object.byteSize !== undefined) {
    headers.set("content-length", String(object.byteSize));
  }

  return new Response(object.body, { headers });
});

imageRoutes.get("/:assetId/url", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const asset = await getReadableImageAsset(c.req.param("assetId"));

  if (!asset) {
    return c.json({ error: "Image asset not found" }, 404);
  }

  const forbidden = await requirePageAccess(c, asset, "view");

  if (forbidden) {
    return forbidden;
  }

  return c.json(await getImageReadUrl(asset, c.env));
});

imageRoutes.delete("/:assetId", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const asset = await getActiveImageAsset(c.req.param("assetId"));

  if (!asset) {
    return c.json({ error: "Image asset not found" }, 404);
  }

  const forbidden = await requirePageAccess(c, asset, "edit");

  if (forbidden) {
    return forbidden;
  }

  await deleteImageAsset(asset, c.env);

  return c.json({ ok: true });
});

function requireUser(c: Context<AppBindings>) {
  return c.get("user") ?? null;
}

async function requirePageAccess(
  c: Context<AppBindings>,
  asset: NonNullable<Awaited<ReturnType<typeof getActiveImageAsset>>>,
  required: "view" | "edit",
) {
  const mismatch = rejectMismatchedApiKeyWorkspace(c, asset.workspaceId);

  if (mismatch) {
    return mismatch;
  }

  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const page = await getPageRecord(asset.pageId);

  if (!page || page.workspaceId !== asset.workspaceId) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(asset.pageId, asset.workspaceId, user.id, required))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return null;
}

function getContentDisposition(c: Context<AppBindings>, filename: string) {
  const disposition = c.req.query("disposition") === "attachment" ? "attachment" : "inline";
  const safeFilename = filename.replace(/["\\\r\n]/g, "_");

  return `${disposition}; filename="${safeFilename}"`;
}
