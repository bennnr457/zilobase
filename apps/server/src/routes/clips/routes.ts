import { Hono } from "hono";
import { createClipOperation, findDuplicateClipOperation } from "../../services/clips/operations";
import { serverOperationContext } from "../http/operation-context";
import { attachServiceErrorHandler } from "../http/route-error";

import type { AppBindings } from "../../shared/contracts/http";

export const clipRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

clipRoutes.post("/", async (c) => {
  const result = await createClipOperation(serverOperationContext(c), {}, () => c.req.json());
  return c.json(result, result.duplicateOf ? 200 : 201);
});

clipRoutes.get("/duplicates", async (c) =>
  c.json(
    await findDuplicateClipOperation(serverOperationContext(c), {
      workspaceId: c.req.query("workspaceId"),
      url: c.req.query("url"),
    }),
    200,
  ),
);
