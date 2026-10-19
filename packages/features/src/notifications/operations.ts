import { type ClientOperationContext } from "../shared/operation-context";
import { clientMutation, runClientMutation } from "../shared/operation-mutation";

import { notificationKeys } from "./queries";

function defineMarkInProductNotificationReadMutation(
  context: ClientOperationContext,
  workspaceId: string | null | undefined,
) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: (notificationId: string | "all") =>
      apiFetch(
        `/workspaces/${encodeURIComponent(workspaceId!)}/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: "POST" },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: notificationKeys.workspace(workspaceId ?? "") }),
  });
}
export type MarkInProductNotificationReadOperationInput = {
  workspaceId: string | null | undefined;
  notificationId: string;
};
export type MarkInProductNotificationReadOperationResult = Awaited<
  ReturnType<
    NonNullable<ReturnType<typeof defineMarkInProductNotificationReadMutation>["mutationFn"]>
  >
>;
export function markInProductNotificationRead(
  context: ClientOperationContext,
  input: MarkInProductNotificationReadOperationInput,
): Promise<MarkInProductNotificationReadOperationResult> {
  const { workspaceId, notificationId } = input;
  return runClientMutation(context, notificationId, (context) =>
    defineMarkInProductNotificationReadMutation(context, workspaceId),
  );
}
