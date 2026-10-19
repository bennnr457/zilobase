import { parseOperationBody } from "../../../shared/validation";
import { getMembership, isPrivilegedOrgRole } from "../../access/principal-access";
import {
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import { UpdateWorkspaceInput } from "../input";
import { updateWorkspaceSettings } from "./workspace-settings";

export type UpdateWorkspaceOperationInput = { workspaceId: string; body?: unknown };
export async function updateWorkspaceOperation(
  context: ServerOperationContext,
  operationInput: UpdateWorkspaceOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  if (context.authentication.authMethod === "oauth")
    throw new ServerOperationError(
      {
        error: "insufficient_scope",
        error_description: "OAuth tokens cannot change workspace membership.",
      },
      403,
    );
  requireOperationPolicy(context, { write: true, oauthScope: undefined });

  const requestUser = context.authentication.user;
  if (!requestUser) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const workspaceId = operationInput.workspaceId;
  requireOperationWorkspace(context, workspaceId);

  const membership = await getMembership(workspaceId, requestUser.id);
  if (!membership) {
    return deny({ error: "Forbidden" }, 403);
  }
  if (!isPrivilegedOrgRole(membership.role)) {
    return deny({ error: "Only workspace admins can update settings." }, 403);
  }
  const parsed = await parseOperationBody(UpdateWorkspaceInput, readBody);
  if (!parsed.ok) {
    return deny({ error: parsed.message || "Invalid request." }, 400);
  }
  const updatedWorkspace = await updateWorkspaceSettings(workspaceId, parsed.data);
  return updatedWorkspace;
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
