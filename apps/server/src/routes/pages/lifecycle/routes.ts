import { Hono } from "hono";
import {
  deletePageOperation,
  restorePageOperation,
} from "../../../services/pages/lifecycle/operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
import { attachServiceErrorHandler } from "../../http/route-error";
export const pageLifecycleRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

pageLifecycleRoutes.post("/:id/restore", async (c) => {
  const result = await restorePageOperation(serverOperationContext(c), {
    pageId: c.req.param("id"),
  });
  return c.json(result);
});

pageLifecycleRoutes.delete("/:id", async (c) => {
  const result = await deletePageOperation(serverOperationContext(c), {
    pageId: c.req.param("id"),
  });
  return c.json(result);
});
