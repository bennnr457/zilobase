import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeImageUpload, createImageUpload, type ImageAsset } from "./image-uploads";

const state = vi.hoisted(() => ({
  events: [] as string[],
  head: vi.fn(),
  remove: vi.fn(),
  set: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("../../../infrastructure/database", () => ({
  db: {
    insert: () => ({
      values: async () => {
        state.events.push("insert");
      },
    }),
    update: () => ({
      set: (value: unknown) => {
        state.set(value);
        return {
          where: () => {
            state.events.push("update");
            return Promise.resolve();
          },
        };
      },
    }),
  },
}));
vi.mock("../../../infrastructure/storage/image-storage", () => ({
  resolveImageStorageMode: () => "s3",
  createImageStorage: () => ({
    createUploadUrl: state.sign,
    head: state.head,
    delete: state.remove,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.events.length = 0;
  state.sign.mockImplementation(async () => {
    state.events.push("sign");
    return { url: "signed-upload" };
  });
  state.remove.mockResolvedValue(undefined);
});

const asset = {
  id: "asset",
  objectKey: "images/asset",
  status: "pending",
  byteSize: 100,
  contentType: "image/png",
} as ImageAsset;

describe("image upload workflow", () => {
  it("persists the pending asset before signing the upload", async () => {
    const result = await createImageUpload(
      {
        workspaceId: "workspace",
        pageId: "page",
        filename: "image.png",
        contentType: "image/png",
        byteSize: 100,
        userId: "user",
      },
      {},
    );
    expect(state.events).toEqual(["insert", "sign"]);
    expect(result.asset.status).toBe("pending");
    expect(result.upload.url).toBe("signed-upload");
  });

  it("marks oversized uploads failed and tolerates object cleanup failure", async () => {
    state.head.mockResolvedValue({ byteSize: 101, contentType: "image/png" });
    state.remove.mockRejectedValue(new Error("storage unavailable"));
    await expect(completeImageUpload(asset, {})).rejects.toMatchObject({
      status: 413,
      message: "Uploaded image is larger than expected",
    });
    expect(state.set).toHaveBeenCalledWith({ status: "failed" });
    expect(state.remove).toHaveBeenCalledWith(asset.objectKey);
  });

  it("does not inspect storage again for an already completed upload", async () => {
    const result = await completeImageUpload({ ...asset, status: "uploaded" }, {});
    expect(result.asset.status).toBe("uploaded");
    expect(state.head).not.toHaveBeenCalled();
    expect(state.set).not.toHaveBeenCalled();
  });

  it("keeps missing objects pending and rejects content-type mismatches", async () => {
    state.head.mockResolvedValue(null);
    await expect(completeImageUpload(asset, {})).rejects.toMatchObject({ status: 409 });
    expect(state.set).not.toHaveBeenCalled();
    state.head.mockResolvedValue({ byteSize: 100, contentType: "image/jpeg" });
    await expect(completeImageUpload(asset, {})).rejects.toMatchObject({ status: 415 });
    expect(state.set).toHaveBeenCalledWith({ status: "failed" });
    expect(state.remove).not.toHaveBeenCalled();
  });
});
