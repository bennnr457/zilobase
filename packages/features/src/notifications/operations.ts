import { type ClientOperationContext } from "../shared/operation-context";
import { runClientMutation } from "../shared/operation-mutation";

import { notificationKeys } from "./queries";

export type MarkInProductNotificationReadOperationInput = {
  workspaceId: string | null | undefined;
  notificationId: string;
};
export type MarkInProductNotificationReadOperationResult = unknown;
export function markInProductNotificationRead(
  context: ClientOperationContext,
  input: MarkInProductNotificationReadOperationInput,
): Promise<MarkInProductNotificationReadOperationResult> {
  const { workspaceId, notificationId } = input;
  return runClientMutation(context, notificationId, ({ apiFetch, queryClient }) => ({
    mutationFn: (notificationId: string) =>
      apiFetch(
        `/workspaces/${encodeURIComponent(workspaceId!)}/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: "POST" },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: notificationKeys.workspace(workspaceId ?? "") }),
  }));
}
