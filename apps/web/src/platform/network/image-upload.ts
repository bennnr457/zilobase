import { getApiRequestHeaders, toApiUrl } from "@/platform/network/api";
import { desktopNetworkFetch } from "@/platform/network/desktop-network";
import type { ClientOperationContext } from "@zilobase/features";
import {
  removeProfileImage as removeProfileImageOperation,
  uploadPageImage as uploadPageImageOperation,
  uploadProfileImage as uploadProfileImageOperation,
  type ImageAsset,
  type ImageUploadTarget,
} from "@zilobase/features/uploads";
export { MAX_PROFILE_IMAGE_BYTES } from "@zilobase/features/uploads";
export type UploadPageImageInput = {
  databaseId?: string | null;
  file: File;
  workspaceId: string;
  pageId: string;
};
export type UploadedPageImage = { asset: ImageAsset; url: string };
export async function uploadPageImage(
  context: ClientOperationContext,
  { file, ...input }: UploadPageImageInput,
): Promise<UploadedPageImage> {
  const result = await uploadPageImageOperation(context, {
    ...input,
    byteSize: file.size,
    contentType: file.type,
    filename: file.name,
    transfer: (target) => putImageBody(target, file),
  });
  return { ...result, url: toApiUrl(result.url) };
}
export function uploadProfileImage(context: ClientOperationContext, file: File) {
  return uploadProfileImageOperation(context, {
    byteSize: file.size,
    contentType: file.type,
    filename: file.name,
    transfer: (target) => putImageBody(target, file),
  });
}
export function removeProfileImage(context: ClientOperationContext) {
  return removeProfileImageOperation(context, {});
}
export function getUserImageUrl(image: string | null | undefined) {
  if (!image) return undefined;
  return /^(?:https?:|blob:|data:)/.test(image) ? image : toApiUrl(image);
}
async function putImageBody(upload: ImageUploadTarget, file: File) {
  const headers =
    upload.storageMode === "binding"
      ? getApiRequestHeaders(upload.headers)
      : new Headers(upload.headers);
  const response = await desktopNetworkFetch(getUploadUrl(upload), {
    body: file,
    credentials: upload.storageMode === "binding" ? "include" : "omit",
    headers,
    method: upload.method,
  });

  if (!response.ok) {
    throw new Error(`Image upload failed with status ${response.status}.`);
  }
}

function getUploadUrl(upload: ImageUploadTarget) {
  if (upload.storageMode === "s3") {
    return upload.url;
  }

  try {
    const url = new URL(upload.url);

    return toApiUrl(`${url.pathname}${url.search}`);
  } catch {
    return toApiUrl(upload.url);
  }
}
