import assert from "node:assert/strict";
import test from "node:test";
import type { ApiFetcher } from "../shared/api-fetcher";
import { createZilobaseClient } from "../shared/client";
import { ExpiredClientOperationError } from "../shared/operation-context";
import {
  MAX_PROFILE_IMAGE_BYTES,
  removeProfileImage,
  uploadPageImage,
  uploadProfileImage,
} from "./index";
const metadata = { byteSize: 4, contentType: "image/png", filename: "image.png" };
const asset = { ...metadata, id: "asset", status: "pending" };
const target = {
  expiresAt: "2099-01-01",
  headers: {},
  method: "PUT",
  storageMode: "s3",
  url: "https://storage.example/upload",
};
function setup(apiFetch: ApiFetcher) {
  const runtime = createZilobaseClient({ deployment: "test" });
  runtime.queryClient.setQueryData(["session"], {
    user: { id: "a", image: null },
    session: { id: "a-session" },
  });
  return { ...runtime, context: { apiFetch, queryClient: runtime.queryClient } };
}
test("page upload composes create, injected byte transfer and complete without React", async () => {
  const calls: string[] = [];
  const runtime = setup(async <T>(path: string, init?: RequestInit) => {
    calls.push(path);
    return (
      path === "/images/uploads"
        ? { asset, upload: target }
        : { asset: { ...asset, status: "uploaded" } }
    ) as T;
  });
  try {
    const result = await uploadPageImage(runtime.context, {
      ...metadata,
      pageId: "page",
      workspaceId: "workspace",
      transfer: async (upload, record) => {
        assert.deepEqual(upload, target);
        assert.deepEqual(record, asset);
        calls.push("transfer");
      },
    });
    assert.deepEqual(calls, ["/images/uploads", "transfer", "/images/uploads/asset/complete"]);
    assert.equal(result.url, "/images/asset");
    assert.equal(result.asset.status, "uploaded");
  } finally {
    runtime.dispose();
  }
});
test("failed byte transfer retains the created record for recovery and does not complete, retry or delete", async () => {
  let calls = 0,
    createdId: string | undefined;
  const runtime = setup(async <T>() => {
    calls++;
    return { asset, upload: target } as T;
  });
  const failure = new Error("transfer failed");
  try {
    await assert.rejects(
      uploadPageImage(runtime.context, {
        ...metadata,
        pageId: "page",
        workspaceId: "workspace",
        transfer: async (_upload, record) => {
          createdId = record.id;
          throw failure;
        },
      }),
      (error) => error === failure,
    );
    assert.equal(createdId, "asset");
    assert.equal(calls, 1);
  } finally {
    runtime.dispose();
  }
});
test("account replacement during profile transfer prevents completion and session cache changes", async () => {
  let calls = 0;
  const runtime = setup(async <T>() => {
    calls++;
    return { image: asset, upload: target } as T;
  });
  const next = { user: { id: "b", image: "next-image" }, session: { id: "b-session" } };
  try {
    await assert.rejects(
      uploadProfileImage(runtime.context, {
        ...metadata,
        transfer: async () => {
          runtime.queryClient.setQueryData(["session"], next);
        },
      }),
      ExpiredClientOperationError,
    );
    assert.equal(calls, 1);
    assert.deepEqual(runtime.queryClient.getQueryData(["session"]), next);
  } finally {
    runtime.dispose();
  }
});
test("profile completion and removal publish the session image through the shared client", async () => {
  const runtime = setup(async <T>(path: string) => {
    if (path.endsWith("/uploads")) return { image: asset, upload: target } as T;
    return { image: path.endsWith("/complete") ? "/profile/image.png" : null } as T;
  });
  try {
    await uploadProfileImage(runtime.context, { ...metadata, transfer: async () => {} });
    assert.equal(
      runtime.queryClient.getQueryData<{ user: { image: string } }>(["session"])?.user.image,
      "/profile/image.png",
    );
    await removeProfileImage(runtime.context, {});
    assert.equal(
      runtime.queryClient.getQueryData<{ user: { image: string | null } }>(["session"])?.user.image,
      null,
    );
  } finally {
    runtime.dispose();
  }
});
test("profile validation rejects oversized bytes before creating an upload", async () => {
  const runtime = setup(async () => {
    throw new Error("unexpected request");
  });
  try {
    await assert.rejects(
      uploadProfileImage(runtime.context, {
        ...metadata,
        byteSize: MAX_PROFILE_IMAGE_BYTES + 1,
        transfer: async () => {},
      }),
      /5 MB/,
    );
  } finally {
    runtime.dispose();
  }
});
