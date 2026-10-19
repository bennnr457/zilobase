import { createImageStorage } from "../../../infrastructure/storage/image-storage";
import type { RuntimeEnv } from "../../../shared/config/config";
import { getReadUrlTtlSeconds } from "../configuration";
import type { ImageAsset } from "../uploads/image-uploads";
export async function getImageReadUrl(asset: ImageAsset, env: RuntimeEnv) {
  const storage = createImageStorage(env);

  if (storage.mode === "s3") {
    const expiresInSeconds = getReadUrlTtlSeconds(env);

    return {
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      storageMode: storage.mode,
      url: await storage.createReadUrl({
        expiresInSeconds,
        filename: asset.filename,
        objectKey: asset.objectKey,
      }),
    };
  }

  return {
    expiresAt: null,
    storageMode: storage.mode,
    url: `/images/${asset.id}`,
  };
}
export function readImageObject(objectKey: string, env: RuntimeEnv) {
  return createImageStorage(env).get(objectKey);
}
