import { updateSessionImage } from "../auth/queries";
import { captureClientOperation, type ClientOperationContext } from "../shared/operation-context";
import type {
  CompleteImageUploadResponse,
  CreateImageUploadResponse,
  CreateProfileImageUploadResponse,
  ImageUploadMetadata,
  PageImageUploadInput,
  ProfileImageUploadInput,
} from "./contracts";

export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const profileImageTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export function validateProfileImage(input: ImageUploadMetadata) {
  if (!profileImageTypes.has(input.contentType))
    throw new Error("Choose a JPG, PNG, GIF, WebP or AVIF image.");
  if (input.byteSize > MAX_PROFILE_IMAGE_BYTES)
    throw new Error("Profile pictures must be 5 MB or smaller.");
}
export function createPageImageUpload(
  context: ClientOperationContext,
  input: Omit<PageImageUploadInput, "transfer">,
) {
  const scope = captureClientOperation(context);
  if (!input.contentType.startsWith("image/")) throw new Error("Only image uploads are supported.");
  return scope.context.apiFetch<CreateImageUploadResponse>("/images/uploads", {
    method: "POST",
    body: JSON.stringify({ ...input, databaseId: input.databaseId || undefined }),
  });
}
export function completePageImageUpload(
  context: ClientOperationContext,
  input: { assetId: string },
) {
  return captureClientOperation(context).context.apiFetch<CompleteImageUploadResponse>(
    `/images/uploads/${encodeURIComponent(input.assetId)}/complete`,
    { method: "POST" },
  );
}
export function removePageImage(context: ClientOperationContext, input: { assetId: string }) {
  return captureClientOperation(context).context.apiFetch<{ ok: true }>(
    `/images/${encodeURIComponent(input.assetId)}`,
    { method: "DELETE" },
  );
}
export async function uploadPageImage(
  context: ClientOperationContext,
  input: PageImageUploadInput,
) {
  const scope = captureClientOperation(context),
    { transfer, ...metadata } = input;
  const { asset, upload } = await createPageImageUpload(scope.context, metadata);
  scope.assertCurrent();
  await transfer(upload, asset);
  scope.assertCurrent();
  const completed = await completePageImageUpload(scope.context, { assetId: asset.id });
  return { asset: completed.asset, url: `/images/${encodeURIComponent(completed.asset.id)}` };
}
export function createProfileImageUpload(
  context: ClientOperationContext,
  input: ImageUploadMetadata,
) {
  validateProfileImage(input);
  return captureClientOperation(context).context.apiFetch<CreateProfileImageUploadResponse>(
    "/user-settings/profile/image/uploads",
    { method: "POST", body: JSON.stringify(input) },
  );
}
export async function completeProfileImageUpload(
  context: ClientOperationContext,
  input: ImageUploadMetadata & { imageId: string },
) {
  const scope = captureClientOperation(context),
    { imageId, ...metadata } = input;
  const result = await scope.context.apiFetch<{ image: string }>(
    `/user-settings/profile/image/uploads/${encodeURIComponent(imageId)}/complete`,
    { method: "POST", body: JSON.stringify(metadata) },
  );
  scope.assertCurrent();
  updateSessionImage(context.queryClient, result.image);
  return result;
}
export async function uploadProfileImage(
  context: ClientOperationContext,
  input: ProfileImageUploadInput,
) {
  const scope = captureClientOperation(context),
    { transfer, ...metadata } = input;
  const { image, upload } = await createProfileImageUpload(scope.context, metadata);
  scope.assertCurrent();
  await transfer(upload, image);
  scope.assertCurrent();
  return completeProfileImageUpload(scope.context, {
    imageId: image.id,
    byteSize: image.byteSize,
    contentType: image.contentType,
    filename: image.filename,
  });
}
export async function removeProfileImage(
  context: ClientOperationContext,
  _input: Record<string, never> = {},
) {
  const scope = captureClientOperation(context);
  const result = await scope.context.apiFetch<{ image: null }>("/user-settings/profile/image", {
    method: "DELETE",
  });
  scope.assertCurrent();
  updateSessionImage(context.queryClient, null);
  return result;
}

export type CreatePageImageUploadInput = Parameters<typeof createPageImageUpload>[1];
export type CreatePageImageUploadResult = Awaited<ReturnType<typeof createPageImageUpload>>;
export type CompletePageImageUploadInput = Parameters<typeof completePageImageUpload>[1];
export type CompletePageImageUploadResult = Awaited<ReturnType<typeof completePageImageUpload>>;
export type RemovePageImageInput = Parameters<typeof removePageImage>[1];
export type RemovePageImageResult = Awaited<ReturnType<typeof removePageImage>>;
export type UploadPageImageInput = Parameters<typeof uploadPageImage>[1];
export type UploadPageImageResult = Awaited<ReturnType<typeof uploadPageImage>>;
export type CreateProfileImageUploadInput = Parameters<typeof createProfileImageUpload>[1];
export type CreateProfileImageUploadResult = Awaited<ReturnType<typeof createProfileImageUpload>>;
export type CompleteProfileImageUploadInput = Parameters<typeof completeProfileImageUpload>[1];
export type CompleteProfileImageUploadResult = Awaited<
  ReturnType<typeof completeProfileImageUpload>
>;
export type UploadProfileImageInput = Parameters<typeof uploadProfileImage>[1];
export type UploadProfileImageResult = Awaited<ReturnType<typeof uploadProfileImage>>;
export type RemoveProfileImageInput = Parameters<typeof removeProfileImage>[1];
export type RemoveProfileImageResult = Awaited<ReturnType<typeof removeProfileImage>>;
