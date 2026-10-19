import {
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import {
  listInProductNotifications,
  markInProductNotificationRead,
} from "./inbox/notification-operations";

export type ListNotificationsOperationInput = { limit?: string; workspaceId: string };
export async function listNotificationsOperation(
  context: ServerOperationContext,
  operationInput: ListNotificationsOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  return (() =>
    listInProductNotifications({
      limit: Number(operationInput.limit ?? 50),
      userId: user.id,
      workspaceId: operationInput.workspaceId,
    }))();
}

export type MarkNotificationReadOperationInput = { notificationId: string; workspaceId: string };
export async function markNotificationReadOperation(
  context: ServerOperationContext,
  operationInput: MarkNotificationReadOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  return (() =>
    markInProductNotificationRead({
      notificationId: operationInput.notificationId,
      userId: user.id,
      workspaceId: operationInput.workspaceId,
    }))();
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
