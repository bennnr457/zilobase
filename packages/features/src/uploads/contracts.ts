export type ImageAsset = {
  byteSize: number;
  contentType: string;
  filename: string;
  id: string;
  status: string;
};

export type ImageUploadTarget = {
  expiresAt: string;
  headers: Record<string, string>;
  method: "PUT";
  storageMode: "s3" | "binding";
  url: string;
};

export type CreateImageUploadResponse = {
  asset: ImageAsset;
  upload: ImageUploadTarget;
};

export type CompleteImageUploadResponse = {
  asset: ImageAsset;
};

export type ProfileImage = {
  byteSize: number;
  contentType: string;
  filename: string;
  id: string;
};

export type CreateProfileImageUploadResponse = {
  image: ProfileImage;
  upload: ImageUploadTarget;
};

export type ImageUploadMetadata = { byteSize: number; contentType: string; filename: string };
/** Physical transfer remains in the caller. The created record identifies partial uploads. */
export type ImageByteTransfer = (
  target: ImageUploadTarget,
  record: ImageUploadMetadata & { id: string },
) => Promise<void>;
export type PageImageUploadInput = ImageUploadMetadata & {
  workspaceId: string;
  pageId: string;
  databaseId?: string | null;
  transfer: ImageByteTransfer;
};
export type ProfileImageUploadInput = ImageUploadMetadata & { transfer: ImageByteTransfer };
