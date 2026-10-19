import {
  requireOperationPolicy,
  ServerOperationError,
  type ServerOperationContext,
} from "../../../operations/context";
import {
  allowedProfileImageContentTypes,
  completeProfileImageUpload,
  createProfileImageUpload,
  getProfileImageMaxBytes,
  isUuid,
  normalizeContentType,
  readPositiveInteger,
  readString,
  removeProfileImage,
  sanitizeFilename,
} from "./profile-images";
type ProfileImageBody = {
  byteSize?: unknown;
  contentType?: unknown;
  filename?: unknown;
};
async function readProfileImageBody(
  input: unknown,
  maxBytes: number,
): Promise<
  | {
      byteSize: number;
      contentType: string;
      filename: string;
    }
  | {
      error: string;
    }
> {
  const body = input as ProfileImageBody | null;
  const byteSize = readPositiveInteger(body?.byteSize);
  const contentType = normalizeContentType(readString(body?.contentType));
  const filename = sanitizeFilename(readString(body?.filename) ?? "image");
  if (!contentType || !allowedProfileImageContentTypes.has(contentType)) {
    return { error: "A supported image content type is required" };
  }
  if (!byteSize || byteSize > maxBytes) {
    return {
      error: `Profile image must be between 1 byte and ${maxBytes} bytes`,
    };
  }
  return { byteSize, contentType, filename };
}

export type CreateProfileImageUploadOperationInput = { body?: unknown };
export async function createProfileImageUploadOperation(
  context: ServerOperationContext,
  operationInput: CreateProfileImageUploadOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });

  const currentUser = context.authentication.user;
  if (!currentUser) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const input = await readProfileImageBody(
    await readBody().catch(() => null),
    getProfileImageMaxBytes(context.env),
  );
  if ("error" in input) {
    return deny({ error: input.error }, 400);
  }
  return await createProfileImageUpload(currentUser.id, input, context.env);
}

export type CompleteProfileImageUploadOperationInput = { imageId: string; body?: unknown };
export async function completeProfileImageUploadOperation(
  context: ServerOperationContext,
  operationInput: CompleteProfileImageUploadOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });

  const currentUser = context.authentication.user;
  if (!currentUser) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const imageId = operationInput.imageId;
  if (!isUuid(imageId)) {
    return deny({ error: "Invalid profile image id" }, 400);
  }
  const input = await readProfileImageBody(
    await readBody().catch(() => null),
    getProfileImageMaxBytes(context.env),
  );
  if ("error" in input) {
    return deny({ error: input.error }, 400);
  }
  return await completeProfileImageUpload(currentUser, imageId, input, context.env);
}

export type RemoveProfileImageOperationInput = {};
export async function removeProfileImageOperation(
  context: ServerOperationContext,
  _input: RemoveProfileImageOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });

  const currentUser = context.authentication.user;
  if (!currentUser) {
    return deny({ error: "Unauthorized" }, 401);
  }
  await removeProfileImage(currentUser, context.env);
  return { image: null };
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
