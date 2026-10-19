import { Hono } from "hono";
import {
  favoritePageOperation,
  recordVisitPageOperation,
  unfavoritePageOperation,
} from "../../../services/pages/navigation/operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
import { readJsonBody } from "../../http/request";
import { attachServiceErrorHandler } from "../../http/route-error";
export const pageVisitRoutes = attachServiceErrorHandler(new Hono<AppBindings>());
export const pageNavigationRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

pageVisitRoutes.post("/item-visits", async (c) => {
  const result = await recordVisitPageOperation(
    serverOperationContext(c),
    { body: undefined },
    () => readJsonBody(c.req),
  );
  return c.json(result);
});

pageNavigationRoutes.put("/:id/favorite", async (c) => {
  const result = await favoritePageOperation(serverOperationContext(c), {
    pageId: c.req.param("id"),
  });
  return c.json(result);
});

pageNavigationRoutes.delete("/:id/favorite", async (c) => {
  const result = await unfavoritePageOperation(serverOperationContext(c), {
    pageId: c.req.param("id"),
  });
  return c.json(result);
});
