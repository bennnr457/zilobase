import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import {
  acceptPageGuestInvitation,
  cancelPageGuestInvitation,
  deletePageAccess,
  invitePageGuest,
  revokePageGuest,
  setPagePublished,
  upsertPageAccess,
} from "./sharing-operations";
export function useUpsertPageAccess() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof upsertPageAccess>[1]) => upsertPageAccess(context, input),
  });
}
export function useDeletePageAccess() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof deletePageAccess>[1]) => deletePageAccess(context, input),
  });
}
export function useSetPagePublished() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof setPagePublished>[1]) => setPagePublished(context, input),
  });
}
export function useInvitePageGuest() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof invitePageGuest>[1]) => invitePageGuest(context, input),
  });
}
export function useCancelPageGuestInvitation() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof cancelPageGuestInvitation>[1]) =>
      cancelPageGuestInvitation(context, input),
  });
}
export function useAcceptPageGuestInvitation() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof acceptPageGuestInvitation>[1]) =>
      acceptPageGuestInvitation(context, input),
  });
}
export function useRevokePageGuest() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof revokePageGuest>[1]) => revokePageGuest(context, input),
  });
}
export { switchPageWorkspace } from "./sharing-operations";
