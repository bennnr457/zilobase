import { Hono } from "hono";
import {
  createApiKeyOperation,
  deleteApiKeyOperation,
  listApiKeysOperation,
  updateApiKeyOperation,
} from "../../services/api-keys/operations";
import { serverOperationContext } from "../http/operation-context";
import { attachServiceErrorHandler } from "../http/route-error";

import type { AppBindings } from "../../shared/contracts/http";

export const apiKeyRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

apiKeyRoutes.get("/", async (c) =>
  c.json(
    await listApiKeysOperation(serverOperationContext(c), {
      workspaceId: c.req.query("workspaceId"),
    }),
    200,
  ),
);

apiKeyRoutes.post("/", async (c) =>
  c.json(await createApiKeyOperation(serverOperationContext(c), {}, () => c.req.json()), 201),
);

apiKeyRoutes.patch("/:id", async (c) =>
  c.json(
    await updateApiKeyOperation(serverOperationContext(c), { id: c.req.param("id")! }, () =>
      c.req.json(),
    ),
    200,
  ),
);

apiKeyRoutes.delete("/:id", async (c) =>
  c.json(await deleteApiKeyOperation(serverOperationContext(c), { id: c.req.param("id")! }), 200),
);
