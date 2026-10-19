import { Hono } from "hono";
import {
  completeProfileImageUploadOperation,
  createProfileImageUploadOperation,
  removeProfileImageOperation,
} from "../../../../services/user-settings/profile/images/operations";
import {
  allowedProfileImageContentTypes,
  getProfileImage,
  getProfileImageMaxBytes,
  isUuid,
  normalizeContentType,
  readPositiveInteger,
  sanitizeFilename,
  writeProfileImageUpload,
} from "../../../../services/user-settings/profile/images/profile-images";
import { serverOperationContext } from "../../../http/operation-context";
import { attachServiceErrorHandler } from "../../../http/route-error";

import { resolveImageStorageMode } from "../../../../infrastructure/storage/image-storage";
import type { AppBindings } from "../../../../shared/contracts/http";

export const profileImageRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

profileImageRoutes.post("/image/uploads", async (c) =>
  c.json(
    await createProfileImageUploadOperation(serverOperationContext(c), {}, () => c.req.json()),
    200,
  ),
);

profileImageRoutes.put("/image/uploads/:imageId/body", async (c) => {
  const currentUser = c.get("user");

  if (!currentUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (resolveImageStorageMode(c.env) !== "binding") {
    return c.json({ error: "Server upload route is only available in binding mode" }, 409);
  }

  const imageId = c.req.param("imageId");
  const filename = sanitizeFilename(c.req.query("filename") ?? "image");
  const contentType = normalizeContentType(c.req.header("content-type"));
  const contentLength = readPositiveInteger(c.req.header("content-length"));

  if (!isUuid(imageId)) {
    return c.json({ error: "Invalid profile image id" }, 400);
  }

  if (!contentType || !allowedProfileImageContentTypes.has(contentType)) {
    return c.json({ error: "A supported image content type is required" }, 400);
  }

  if (contentLength && contentLength > getProfileImageMaxBytes(c.env)) {
    return c.json({ error: "Profile image is too large" }, 413);
  }

  if (!c.req.raw.body) {
    return c.json({ error: "Image body is required" }, 400);
  }

  await writeProfileImageUpload(
    currentUser.id,
    imageId,
    filename,
    contentType,
    c.req.raw.body,
    c.env,
  );

  return c.json({ ok: true });
});

profileImageRoutes.post("/image/uploads/:imageId/complete", async (c) =>
  c.json(
    await completeProfileImageUploadOperation(
      serverOperationContext(c),
      { imageId: c.req.param("imageId")! },
      () => c.req.json(),
    ),
    200,
  ),
);

profileImageRoutes.delete("/image", async (c) =>
  c.json(await removeProfileImageOperation(serverOperationContext(c), {}), 200),
);

profileImageRoutes.get("/images/:userId/:imageId/:filename", async (c) => {
  if (!c.get("user")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = c.req.param("userId");
  const imageId = c.req.param("imageId");
  const filename = sanitizeFilename(c.req.param("filename"));

  if (!isUuid(imageId)) {
    return c.json({ error: "Profile image not found" }, 404);
  }

  const object = await getProfileImage(userId, imageId, filename, c.env);

  if (!object) {
    return c.json({ error: "Profile image not found" }, 404);
  }

  const headers = new Headers({
    "cache-control": "private, max-age=300",
    "content-type": object.contentType ?? "application/octet-stream",
  });

  if (object.byteSize !== undefined) {
    headers.set("content-length", String(object.byteSize));
  }

  return new Response(object.body, { headers });
});
