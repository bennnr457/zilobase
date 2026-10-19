import { getStringEnv, type RuntimeEnv } from "../../shared/config/config";
import { readPositiveInteger } from "./image-upload-input";
const defaultMaxImageBytes = 10 * 1024 * 1024;
const defaultUploadUrlTtlSeconds = 10 * 60;
const defaultReadUrlTtlSeconds = 5 * 60;
export function getImageUploadMaxBytes(env: RuntimeEnv) {
  return readPositiveInteger(getStringEnv(env, "IMAGE_UPLOAD_MAX_BYTES")) ?? defaultMaxImageBytes;
}

export function getUploadUrlTtlSeconds(env: RuntimeEnv) {
  return (
    readPositiveInteger(getStringEnv(env, "IMAGE_UPLOAD_URL_TTL_SECONDS")) ??
    defaultUploadUrlTtlSeconds
  );
}

export function getReadUrlTtlSeconds(env: RuntimeEnv) {
  return (
    readPositiveInteger(getStringEnv(env, "IMAGE_READ_URL_TTL_SECONDS")) ?? defaultReadUrlTtlSeconds
  );
}
