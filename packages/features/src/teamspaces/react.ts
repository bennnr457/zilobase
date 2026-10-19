import type {
  CreateTeamspaceOperationInput,
  UpdateTeamspaceOperationInput,
  TeamspaceLifecycleOperationInput,
  UpdateTeamspaceDefaultsOperationInput,
  UpdateTeamspaceInviteLinkOperationInput,
  AcceptTeamspaceInviteOperationInput,
  UpdateTeamspaceSettingsOperationInput,
  SetTeamspaceMembershipOperationInput,
} from "./operations";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  acceptTeamspaceInvite,
  addTeamspacePrincipal,
  createTeamspace,
  removeTeamspacePrincipal,
  setTeamspaceMembership,
  teamspaceLifecycle,
  updateTeamspace,
  updateTeamspaceDefaults,
  updateTeamspaceInviteLink,
  updateTeamspacePrincipal,
  updateTeamspaceSettings,
} from "./operations";

import { useZilobaseFeatures } from "../shared/context";
import {
  archivedTeamspacesQueryOptions,
  teamspacePrincipalsQueryOptions,
  teamspaceSettingsQueryOptions,
  teamspacesQueryOptions,
} from "./queries";

export function useTeamspaces(workspaceId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(teamspacesQueryOptions(apiFetch, workspaceId));
}

export function useArchivedTeamspaces(workspaceId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(archivedTeamspacesQueryOptions(apiFetch, workspaceId));
}

export function useTeamspaceSettings(workspaceId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(teamspaceSettingsQueryOptions(apiFetch, workspaceId));
}

export function useTeamspacePrincipals(
  workspaceId: string | null | undefined,
  teamspaceId: string | null | undefined,
) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(teamspacePrincipalsQueryOptions(apiFetch, workspaceId, teamspaceId));
}

export function useCreateTeamspace() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: CreateTeamspaceOperationInput) => createTeamspace(context, variables),
  });
}

export function useUpdateTeamspace() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: UpdateTeamspaceOperationInput) => updateTeamspace(context, variables),
  });
}

export function useTeamspaceLifecycle() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: TeamspaceLifecycleOperationInput) =>
      teamspaceLifecycle(context, variables),
  });
}

export function useUpdateTeamspaceDefaults() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: UpdateTeamspaceDefaultsOperationInput) =>
      updateTeamspaceDefaults(context, variables),
  });
}

export function useUpdateTeamspaceInviteLink() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: UpdateTeamspaceInviteLinkOperationInput) =>
      updateTeamspaceInviteLink(context, variables),
  });
}

export function useAcceptTeamspaceInvite() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: AcceptTeamspaceInviteOperationInput) =>
      acceptTeamspaceInvite(context, variables),
  });
}

export function useUpdateTeamspaceSettings() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: UpdateTeamspaceSettingsOperationInput) =>
      updateTeamspaceSettings(context, variables),
  });
}

export function useSetTeamspaceMembership() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: SetTeamspaceMembershipOperationInput) =>
      setTeamspaceMembership(context, variables),
  });
}

export function useAddTeamspacePrincipal() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof addTeamspacePrincipal>[1]) =>
      addTeamspacePrincipal(context, input),
  });
}

export function useUpdateTeamspacePrincipal() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateTeamspacePrincipal>[1]) =>
      updateTeamspacePrincipal(context, input),
  });
}

export function useRemoveTeamspacePrincipal() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof removeTeamspacePrincipal>[1]) =>
      removeTeamspacePrincipal(context, input),
  });
}
