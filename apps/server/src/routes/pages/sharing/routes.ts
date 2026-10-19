import { Hono } from "hono";
import {
  getAccessPageOperation,
  getAccessTargetsPageOperation,
  removeAccessPageOperation,
  removePublicAccessPageOperation,
  upsertAccessPageOperation,
} from "../../../services/pages/sharing/operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
import { readJsonBody } from "../../http/request";
import { attachServiceErrorHandler } from "../../http/route-error";
export const pageSharingRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

pageSharingRoutes.get("/:id/access", async (c) => {
  const result = await getAccessPageOperation(serverOperationContext(c), {
    pageId: c.req.param("id"),
  });
  return c.json(result);
});

pageSharingRoutes.get("/:id/access-targets", async (c) => {
  const result = await getAccessTargetsPageOperation(serverOperationContext(c), {
    pageId: c.req.param("id"),
  });
  return c.json(result);
});

pageSharingRoutes.put("/:id/access", async (c) => {
  const result = await upsertAccessPageOperation(
    serverOperationContext(c),
    { pageId: c.req.param("id"), body: undefined },
    () => readJsonBody(c.req),
  );
  return c.json(result);
});

pageSharingRoutes.delete("/:id/access/public", async (c) => {
  const result = await removePublicAccessPageOperation(serverOperationContext(c), {
    pageId: c.req.param("id"),
  });
  return c.json(result);
});

pageSharingRoutes.delete("/:id/access/:ruleId", async (c) => {
  const result = await removeAccessPageOperation(serverOperationContext(c), {
    pageId: c.req.param("id"),
    ruleId: c.req.param("ruleId"),
  });
  return c.json(result);
});
