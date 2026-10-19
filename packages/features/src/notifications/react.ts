import { useMutation, useQuery } from "@tanstack/react-query";
import {
  markInProductNotificationRead,
  type MarkInProductNotificationReadOperationInput,
} from "./operations";

import { useZilobaseFeatures } from "../shared/context";
import { notificationListQueryOptions } from "./queries";

export function useInProductNotifications(workspaceId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(notificationListQueryOptions(apiFetch, workspaceId));
}

export function useMarkInProductNotificationRead(workspaceId: string | null | undefined) {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: MarkInProductNotificationReadOperationInput["notificationId"]) =>
      markInProductNotificationRead(context, { workspaceId, notificationId: variables }),
  });
}
