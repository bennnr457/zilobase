import type {
  UpdateWorkspaceGuestPolicyOperationInput,
  ReviewWorkspaceGuestRequestOperationInput,
  PromoteWorkspaceGuestOperationInput,
  RevokeWorkspaceGuestOperationInput,
  InviteWorkspaceMemberOperationInput,
  UpdateWorkspaceMemberOperationInput,
  RemoveWorkspaceMemberOperationInput,
  UpdateWorkspaceOperationInput,
  DeleteWorkspaceOperationInput,
} from "./operations";
import { useMutation, useQuery } from "@tanstack/react-query";
import { resolveActiveWorkspaceId } from "./model";
import {
  acceptWorkspaceInvitation,
  createWorkspace,
  deleteWorkspace,
  inviteWorkspaceMember,
  promoteWorkspaceGuest,
  removeWorkspaceMember,
  reviewWorkspaceGuestRequest,
  revokeWorkspaceGuest,
  setActiveWorkspace,
  updateWorkspace,
  updateWorkspaceGuestPolicy,
  updateWorkspaceMember,
} from "./operations";

import { useSession } from "../auth/react";
import { useZilobaseFeatures } from "../shared/context";
import {
  workspaceAccessTargetsQueryOptions,
  workspaceGuestPolicyQueryOptions,
  workspaceGuestRequestsQueryOptions,
  workspaceGuestsQueryOptions,
  workspaceInvitationsQueryOptions,
  workspacesQueryOptions,
} from "./queries";

export function useWorkspaces() {
  const { auth } = useZilobaseFeatures();

  return useQuery(workspacesQueryOptions(auth));
}

export function useActiveWorkspaceId() {
  const { auth, preferredActiveWorkspaceId } = useZilobaseFeatures();
  const { data: sessionData } = useSession();
  const workspacesQuery = useQuery(workspacesQueryOptions(auth));

  return resolveActiveWorkspaceId({
    preferredActiveWorkspaceId,
    sessionWorkspaceId: sessionData?.session?.activeWorkspaceId ?? null,
    status: workspacesQuery.status,
    workspaces: workspacesQuery.data ?? [],
  });
}

export function useWorkspaceAccessTargets(workspaceId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();

  return useQuery(workspaceAccessTargetsQueryOptions(apiFetch, workspaceId));
}

export function useWorkspaceInvitations(workspaceId: string | null | undefined) {
  const { auth } = useZilobaseFeatures();

  return useQuery(workspaceInvitationsQueryOptions(auth, workspaceId));
}

export function useWorkspaceGuests(
  workspaceId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery({
    ...workspaceGuestsQueryOptions(apiFetch, workspaceId),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
  });
}

export function useWorkspaceGuestPolicy(
  workspaceId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery({
    ...workspaceGuestPolicyQueryOptions(apiFetch, workspaceId),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
  });
}

export function useWorkspaceGuestRequests(
  workspaceId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery({
    ...workspaceGuestRequestsQueryOptions(apiFetch, workspaceId),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
  });
}

export function useUpdateWorkspaceGuestPolicy() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: UpdateWorkspaceGuestPolicyOperationInput) =>
      updateWorkspaceGuestPolicy(context, variables),
  });
}

export function useReviewWorkspaceGuestRequest() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: ReviewWorkspaceGuestRequestOperationInput) =>
      reviewWorkspaceGuestRequest(context, variables),
  });
}

export function usePromoteWorkspaceGuest() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: PromoteWorkspaceGuestOperationInput) =>
      promoteWorkspaceGuest(context, variables),
  });
}

export function useRevokeWorkspaceGuest() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: RevokeWorkspaceGuestOperationInput) =>
      revokeWorkspaceGuest(context, variables),
  });
}

export function useCreateWorkspace() {
  const context = useZilobaseFeatures();
  return useMutation({ mutationFn: (variables: string) => createWorkspace(context, variables) });
}

export function useInviteWorkspaceMember() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: InviteWorkspaceMemberOperationInput) =>
      inviteWorkspaceMember(context, variables),
  });
}

export function useUpdateWorkspaceMember() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: UpdateWorkspaceMemberOperationInput) =>
      updateWorkspaceMember(context, variables),
  });
}

export function useRemoveWorkspaceMember() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: RemoveWorkspaceMemberOperationInput) =>
      removeWorkspaceMember(context, variables),
  });
}

export function useAcceptWorkspaceInvitation() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: string) => acceptWorkspaceInvitation(context, variables),
  });
}

export function useSetActiveWorkspace() {
  const context = useZilobaseFeatures();
  return useMutation({ mutationFn: (variables: string) => setActiveWorkspace(context, variables) });
}

export function useUpdateWorkspace() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: UpdateWorkspaceOperationInput) => updateWorkspace(context, variables),
  });
}

export function useDeleteWorkspace() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: DeleteWorkspaceOperationInput) => deleteWorkspace(context, variables),
  });
}
