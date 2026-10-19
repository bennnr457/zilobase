import type { Context } from "hono";
import type { AccessLevel } from "../../services/access/access-level";
import { ServerOperationError } from "../../services/operations/context";
import { authorizePageOperation } from "../../services/pages/access";
import type { AppBindings } from "../../shared/contracts/http";
import { serverOperationContext } from "../http/operation-context";
import { httpRouteErrorResponse } from "../http/route-error";

export async function authorizePageRoute(
  c: Context<AppBindings>,
  required: Exclude<AccessLevel, "none">,
) {
  try {
    return {
      ok: true as const,
      ...(await authorizePageOperation(serverOperationContext(c), c.req.param("id")!, required)),
    };
  } catch (error) {
    if (error instanceof ServerOperationError)
      return { ok: false as const, response: httpRouteErrorResponse(c, error)! };
    throw error;
  }
}
