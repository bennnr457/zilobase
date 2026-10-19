import { Hono } from "hono";
import {
  getUserSettingsOperation,
  updateUserProfileOperation,
  updateUserSettingsOperation,
} from "../../services/user-settings/operations";
import type { AppBindings } from "../../shared/contracts/http";
import { serverOperationContext } from "../http/operation-context";
import { attachServiceErrorHandler } from "../http/route-error";

export const pageSettingsRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

pageSettingsRoutes.get("/", async (c) =>
  c.json(await getUserSettingsOperation(serverOperationContext(c), {}), 200),
);

pageSettingsRoutes.patch("/", async (c) =>
  c.json(await updateUserSettingsOperation(serverOperationContext(c), {}, () => c.req.json()), 200),
);

pageSettingsRoutes.patch("/profile", async (c) =>
  c.json(await updateUserProfileOperation(serverOperationContext(c), {}, () => c.req.json()), 200),
);
