import { eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { imageAsset } from "../../../infrastructure/database/schema";
import {
  createImageStorage,
  resolveImageStorageMode,
} from "../../../infrastructure/storage/image-storage";
import type { RuntimeEnv } from "../../../shared/config/config";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { getUploadUrlTtlSeconds } from "../configuration";
import { getImageObjectKey, normalizeContentType } from "../image-upload-input";
export type ImageAsset = typeof imageAsset.$inferSelect;
function toImageAssetResponse(asset: {
  byteSize: number;
  contentType: string;
  filename: string;
  id: string;
  status: string;
}) {
  return {
    byteSize: asset.byteSize,
    contentType: asset.contentType,
    filename: asset.filename,
    id: asset.id,
    status: asset.status,
  };
}

export async function createImageUpload(
  input: {
    workspaceId: string;
    pageId: string;
    filename: string;
    contentType: string;
    byteSize: number;
    databaseId?: string;
    userId: string;
  },
  env: RuntimeEnv,
) {
  const { workspaceId, pageId, filename, contentType, byteSize, databaseId, userId } = input;
  const storageMode = resolveImageStorageMode(env);
  const storage = createImageStorage(env);
  const assetId = crypto.randomUUID();
  const objectKey = getImageObjectKey({
    assetId,
    filename,
    workspaceId,
    pageId,
  });
  const createdAt = new Date();

  await db.insert(imageAsset).values({
    byteSize,
    contentType,
    createdAt,
    createdById: userId,
    databaseId,
    filename,
    id: assetId,
    objectKey,
    workspaceId,
    status: "pending",
    pageId,
  });

  if (storageMode === "s3") {
    const upload = await storage.createUploadUrl({
      byteSize,
      contentType,
      expiresInSeconds: getUploadUrlTtlSeconds(env),
      objectKey,
    });

    return {
      asset: toImageAssetResponse({
        byteSize,
        contentType,
        filename,
        id: assetId,
        status: "pending",
      }),
      upload,
    };
  }

  const url = `/images/uploads/${assetId}/body`;

  return {
    asset: toImageAssetResponse({
      byteSize,
      contentType,
      filename,
      id: assetId,
      status: "pending",
    }),
    upload: {
      expiresAt: new Date(Date.now() + getUploadUrlTtlSeconds(env) * 1000).toISOString(),
      headers: {
        "Content-Type": contentType,
      },
      method: "PUT" as const,
      storageMode,
      url,
    },
  };
}

export async function writeImageUpload(
  asset: ImageAsset,
  body: ReadableStream<Uint8Array>,
  env: RuntimeEnv,
) {
  const storage = createImageStorage(env);

  await storage.putObject({
    body: body,
    contentType: asset.contentType,
    objectKey: asset.objectKey,
  });
}

export async function completeImageUpload(asset: ImageAsset, env: RuntimeEnv) {
  if (asset.status === "uploaded") {
    return { asset: toImageAssetResponse(asset) };
  }

  if (asset.status !== "pending") {
    throw new ServiceMutationError("Image asset cannot be completed", 409);
  }

  const storage = createImageStorage(env);
  const object = await storage.head(asset.objectKey);

  if (!object) {
    throw new ServiceMutationError("Uploaded image object was not found", 409);
  }

  if (object.byteSize !== undefined && object.byteSize > asset.byteSize) {
    await db.update(imageAsset).set({ status: "failed" }).where(eq(imageAsset.id, asset.id));
    await storage.delete(asset.objectKey).catch(() => undefined);

    throw new ServiceMutationError("Uploaded image is larger than expected", 413);
  }

  if (object.contentType && normalizeContentType(object.contentType) !== asset.contentType) {
    await db.update(imageAsset).set({ status: "failed" }).where(eq(imageAsset.id, asset.id));

    throw new ServiceMutationError("Uploaded image content type does not match", 415);
  }

  const [updated] = await db
    .update(imageAsset)
    .set({
      status: "uploaded",
      uploadedAt: new Date(),
    })
    .where(eq(imageAsset.id, asset.id))
    .returning();

  return { asset: toImageAssetResponse(updated ?? asset) };
}

export async function deleteImageAsset(asset: ImageAsset, env: RuntimeEnv) {
  await db
    .update(imageAsset)
    .set({ deletedAt: new Date(), status: "deleted" })
    .where(eq(imageAsset.id, asset.id));
  await createImageStorage(env)
    .delete(asset.objectKey)
    .catch((error) => {
      console.error("Failed to delete image object", error);
    });
}
