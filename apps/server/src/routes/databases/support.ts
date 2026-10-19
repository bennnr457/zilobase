import type { Context } from "hono";

import type { AppBindings } from "../../shared/contracts/http";
import { getAuthenticatedUser } from "../http/auth";

export function requireDatabaseRouteUser(c: Context<AppBindings>) {
  return getAuthenticatedUser(c);
}
