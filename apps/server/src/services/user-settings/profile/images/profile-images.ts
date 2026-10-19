import { eq } from "drizzle-orm";
import { db } from "../../../../infrastructure/database/index";
import { user } from "../../../../infrastructure/database/schema";
import {
  createImageStorage,
  resolveImageStorageMode,
  type ImageStorage,
} from "../../../../infrastructure/storage/image-storage";
import type { RuntimeEnv } from "../../../../shared/config/config";
import { getStringEnv } from "../../../../shared/config/config";
import { ServiceMutationError } from "../../../../shared/errors/service-mutation-error";
const defaultMaxProfileImageBytes = 5 * 1024 * 1024;
const defaultUploadUrlTtlSeconds = 10 * 60;
export const allowedProfileImageContentTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function readPositiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function normalizeContentType(value: string | undefined) {
  return value?.split(";")[0]?.trim().toLowerCase();
}

export function sanitizeFilename(value: string) {
  const basename = value.split(/[\\/]/).pop() ?? "image";
  const safe = basename
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return safe || "image";
}

export function getProfileImageMaxBytes(env: RuntimeEnv) {
  const configured = readPositiveInteger(getStringEnv(env, "IMAGE_UPLOAD_MAX_BYTES"));

  return configured
    ? Math.min(configured, defaultMaxProfileImageBytes)
    : defaultMaxProfileImageBytes;
}

export function getUploadUrlTtlSeconds(env: RuntimeEnv) {
  return (
    readPositiveInteger(getStringEnv(env, "IMAGE_UPLOAD_URL_TTL_SECONDS")) ??
    defaultUploadUrlTtlSeconds
  );
}

export function getProfileImagePath(options: {
  filename: string;
  imageId: string;
  userId: string;
}) {
  return [
    "/user-settings/profile/images",
    encodeURIComponent(options.userId),
    encodeURIComponent(options.imageId),
    encodeURIComponent(options.filename),
  ].join("/");
}

export function getProfileImageObjectKey(options: {
  filename: string;
  imageId: string;
  userId: string;
}) {
  return [
    "users",
    encodeObjectKeySegment(options.userId),
    "profile",
    encodeObjectKeySegment(options.imageId),
    options.filename,
  ].join("/");
}

function encodeObjectKeySegment(value: string) {
  return encodeURIComponent(value).replace(/%2F/gi, "-");
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function deletePreviousProfileImage(
  storage: ImageStorage,
  image: string | null | undefined,
  userId: string,
  exceptObjectKey?: string,
) {
  const objectKey = getOwnedProfileImageObjectKey(image, userId);

  if (objectKey && objectKey !== exceptObjectKey) {
    await deleteProfileImageObject(storage, objectKey);
  }
}

async function deleteProfileImageObject(storage: ImageStorage, objectKey: string) {
  await storage.delete(objectKey).catch((error) => {
    console.error("Failed to delete previous profile image", error);
  });
}

function getOwnedProfileImageObjectKey(image: string | null | undefined, userId: string) {
  if (!image) {
    return null;
  }

  const match = image.match(/^\/user-settings\/profile\/images\/([^/]+)\/([^/]+)\/([^/]+)$/);

  if (!match) {
    return null;
  }

  const [, encodedUserId, encodedImageId, encodedFilename] = match;
  const storedUserId = safeDecodeURIComponent(encodedUserId);
  const imageId = safeDecodeURIComponent(encodedImageId);
  const decodedFilename = safeDecodeURIComponent(encodedFilename);

  if (
    !storedUserId ||
    !imageId ||
    !decodedFilename ||
    storedUserId !== userId ||
    !isUuid(imageId)
  ) {
    return null;
  }

  const filename = sanitizeFilename(decodedFilename);

  return getProfileImageObjectKey({ filename, imageId, userId });
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export async function createProfileImageUpload(
  userId: string,
  input: { filename: string; byteSize: number; contentType: string },
  env: RuntimeEnv,
) {
  const imageId = crypto.randomUUID();
  const objectKey = getProfileImageObjectKey({
    filename: input.filename,
    imageId,
    userId: userId,
  });
  const storageMode = resolveImageStorageMode(env);
  const storage = createImageStorage(env);
  const upload =
    storageMode === "s3"
      ? await storage.createUploadUrl({
          byteSize: input.byteSize,
          contentType: input.contentType,
          expiresInSeconds: getUploadUrlTtlSeconds(env),
          objectKey,
        })
      : {
          expiresAt: new Date(Date.now() + getUploadUrlTtlSeconds(env) * 1000).toISOString(),
          headers: { "Content-Type": input.contentType },
          method: "PUT" as const,
          storageMode,
          url: [
            `/user-settings/profile/image/uploads/${imageId}/body`,
            `?filename=${encodeURIComponent(input.filename)}`,
          ].join(""),
        };

  return {
    image: {
      byteSize: input.byteSize,
      contentType: input.contentType,
      filename: input.filename,
      id: imageId,
    },
    upload,
  };
}

export async function writeProfileImageUpload(
  userId: string,
  imageId: string,
  filename: string,
  contentType: string,
  body: ReadableStream<Uint8Array>,
  env: RuntimeEnv,
) {
  await createImageStorage(env).putObject({
    body: body,
    contentType,
    objectKey: getProfileImageObjectKey({
      filename,
      imageId,
      userId: userId,
    }),
  });
}

export async function completeProfileImageUpload(
  currentUser: { id: string; image?: string | null },
  imageId: string,
  input: { filename: string; byteSize: number; contentType: string },
  env: RuntimeEnv,
) {
  const storage = createImageStorage(env);
  const objectKey = getProfileImageObjectKey({
    filename: input.filename,
    imageId,
    userId: currentUser.id,
  });
  const object = await storage.head(objectKey);

  if (!object) {
    throw new ServiceMutationError("Uploaded profile image was not found", 409);
  }

  if (
    object.byteSize !== undefined &&
    (object.byteSize > input.byteSize || object.byteSize > getProfileImageMaxBytes(env))
  ) {
    await storage.delete(objectKey).catch(() => undefined);
    throw new ServiceMutationError("Profile image is too large", 413);
  }

  if (object.contentType && normalizeContentType(object.contentType) !== input.contentType) {
    await storage.delete(objectKey).catch(() => undefined);
    throw new ServiceMutationError("Uploaded profile image type does not match", 415);
  }

  const image = getProfileImagePath({
    filename: input.filename,
    imageId,
    userId: currentUser.id,
  });

  await db.update(user).set({ image, updatedAt: new Date() }).where(eq(user.id, currentUser.id));

  await deletePreviousProfileImage(storage, currentUser.image, currentUser.id, objectKey);

  return { image };
}

export async function removeProfileImage(
  currentUser: { id: string; image?: string | null },
  env: RuntimeEnv,
) {
  const previousObjectKey = getOwnedProfileImageObjectKey(currentUser.image, currentUser.id);

  await db
    .update(user)
    .set({ image: null, updatedAt: new Date() })
    .where(eq(user.id, currentUser.id));

  if (previousObjectKey) {
    await deleteProfileImageObject(createImageStorage(env), previousObjectKey);
  }
}

export async function getProfileImage(
  userId: string,
  imageId: string,
  filename: string,
  env: RuntimeEnv,
) {
  const imagePath = getProfileImagePath({ filename, imageId, userId });
  const [owner] = await db
    .select({ image: user.image })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!owner || owner.image !== imagePath) {
    return null;
  }

  const object = await createImageStorage(env).get(
    getProfileImageObjectKey({ filename, imageId, userId }),
  );

  return object;
}
