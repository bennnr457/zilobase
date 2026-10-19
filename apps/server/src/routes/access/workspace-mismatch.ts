import type { Context } from "hono";
import type { AppBindings } from "../../shared/contracts/http";

import { ServerOperationError } from "../../services/operations/context";
import { requireActivePageWorkspace } from "../../services/pages/access";
import { serverOperationContext } from "../http/operation-context";
import { httpRouteErrorResponse } from "../http/route-error";

export async function rejectActiveWorkspaceMismatch(
  c: Context<AppBindings>,
  pageWorkspaceId: string,
  userId: string,
) {
  try {
    await requireActivePageWorkspace(serverOperationContext(c), pageWorkspaceId, userId);
    return null;
  } catch (error) {
    if (error instanceof ServerOperationError) return httpRouteErrorResponse(c, error)!;
    throw error;
  }
}
