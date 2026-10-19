import { getMembership } from "../access/principal-access";
import {
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { searchWorkspaceItems } from "./workspace-search";
const maxSearchResults = 50;
export type SearchWorkspaceOperationInput = { workspaceId?: string; types?: string; q?: string };
export async function searchWorkspaceOperation(
  context: ServerOperationContext,
  operationInput: SearchWorkspaceOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: "search.read" });

  const user = context.authentication.user;
  if (!user) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const workspaceId = operationInput.workspaceId;
  if (!workspaceId) {
    return deny({ error: "workspaceId is required" }, 400);
  }
  requireOperationWorkspace(context, workspaceId);

  if (!(await getMembership(workspaceId, user.id))) {
    return deny({ error: "Forbidden" }, 403);
  }
  const requestedTypes = (operationInput.types ?? "")
    .split(",")
    .filter((type): type is "database" | "page" => type === "database" || type === "page");
  const results = await searchWorkspaceItems({
    limit: maxSearchResults,
    membershipVerified: true,
    query: operationInput.q ?? "",
    types: requestedTypes.length ? requestedTypes : undefined,
    userId: user.id,
    workspaceId,
  });
  return {
    results,
  };
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
