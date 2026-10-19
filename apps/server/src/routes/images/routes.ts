import type { Context } from "hono";
import { Hono } from "hono";
import { resolveImageStorageMode } from "../../infrastructure/storage/image-storage";
import {
  getActiveImageAsset,
  getReadableImageAsset,
} from "../../services/images/access/image-access";
import {
  normalizeContentType,
  readPositiveInteger,
} from "../../services/images/image-upload-input";
import {
  completeImageUploadOperation,
  createImageUploadOperation,
  getImageUrlOperation,
  removeImageOperation,
  requireImagePageAccess,
} from "../../services/images/operations";
import { readImageObject } from "../../services/images/read/image-read";
import { writeImageUpload } from "../../services/images/uploads/image-uploads";
import type { AppBindings } from "../../shared/contracts/http";
import { serverOperationContext } from "../http/operation-context";
import { attachServiceErrorHandler } from "../http/route-error";

export const imageRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

imageRoutes.post("/uploads", async (c) =>
  c.json(await createImageUploadOperation(serverOperationContext(c), {}, () => c.req.json()), 200),
);

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

  const forbidden = await requireImagePageAccess(serverOperationContext(c), asset, "edit");

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

imageRoutes.post("/uploads/:assetId/complete", async (c) =>
  c.json(
    await completeImageUploadOperation(serverOperationContext(c), {
      assetId: c.req.param("assetId")!,
    }),
    200,
  ),
);

imageRoutes.get("/:assetId", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const asset = await getReadableImageAsset(c.req.param("assetId"));

  if (!asset) {
    return c.json({ error: "Image asset not found" }, 404);
  }

  const forbidden = await requireImagePageAccess(serverOperationContext(c), asset, "view");

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

imageRoutes.get("/:assetId/url", async (c) =>
  c.json(
    await getImageUrlOperation(serverOperationContext(c), { assetId: c.req.param("assetId")! }),
    200,
  ),
);

imageRoutes.delete("/:assetId", async (c) =>
  c.json(
    await removeImageOperation(serverOperationContext(c), { assetId: c.req.param("assetId")! }),
    200,
  ),
);

function requireUser(c: Context<AppBindings>) {
  return c.get("user") ?? null;
}

function getContentDisposition(c: Context<AppBindings>, filename: string) {
  const disposition = c.req.query("disposition") === "attachment" ? "attachment" : "inline";
  const safeFilename = filename.replace(/["\\\r\n]/g, "_");

  return `${disposition}; filename="${safeFilename}"`;
}
