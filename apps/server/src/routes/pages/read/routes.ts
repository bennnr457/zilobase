import { Hono } from "hono";
import {
  getPageOperation,
  getPagePublishedOperation,
  listPagesOperation,
} from "../../../services/pages/read/operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
import { attachServiceErrorHandler } from "../../http/route-error";
export const pageBrowseRoutes = attachServiceErrorHandler(new Hono<AppBindings>());
export const pageBrowseDetailRoutes = attachServiceErrorHandler(new Hono<AppBindings>());
pageBrowseRoutes.get("/", async (c) =>
  c.json(
    await listPagesOperation(serverOperationContext(c), {
      workspaceId: c.req.query("workspaceId"),
      deleted: c.req.query("deleted") === "only",
    }),
  ),
);
pageBrowseDetailRoutes.get("/:id", async (c) =>
  c.json(await getPageOperation(serverOperationContext(c), { pageId: c.req.param("id") })),
);
pageBrowseDetailRoutes.get("/:id/published", async (c) =>
  c.json(await getPagePublishedOperation(serverOperationContext(c), { pageId: c.req.param("id") })),
);
