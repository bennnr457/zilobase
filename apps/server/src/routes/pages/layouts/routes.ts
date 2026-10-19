import { Hono } from "hono";
import {
  resetPageLayoutOperation,
  resolvePageLayoutOperation,
  savePageLayoutOperation,
} from "../../../services/pages/layouts/operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
import { readJsonBody } from "../../http/request";
import { attachServiceErrorHandler } from "../../http/route-error";
export const pageLayoutRoutes = attachServiceErrorHandler(new Hono<AppBindings>());
pageLayoutRoutes.get("/resolve", async (c) =>
  c.json(
    await resolvePageLayoutOperation(serverOperationContext(c), {
      pageId: c.req.query("pageId"),
      databaseId: c.req.query("databaseId"),
    }),
  ),
);
pageLayoutRoutes.put("/:scope/:scopeId", async (c) =>
  c.json(
    await savePageLayoutOperation(
      serverOperationContext(c),
      { scope: c.req.param("scope"), scopeId: c.req.param("scopeId"), body: undefined },
      () => readJsonBody(c.req),
    ),
  ),
);
pageLayoutRoutes.delete("/:scope/:scopeId", async (c) =>
  c.json(
    await resetPageLayoutOperation(serverOperationContext(c), {
      scope: c.req.param("scope"),
      scopeId: c.req.param("scopeId"),
    }),
  ),
);
