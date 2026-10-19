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
import type { TeamspaceAccessMode } from "./contracts";
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
    mutationFn: (variables: {
      accessMode: TeamspaceAccessMode;
      description?: string | null;
      name: string;
      workspaceId: string;
    }) => createTeamspace(context, variables),
  });
}

export function useUpdateTeamspace() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: {
      accessMode?: TeamspaceAccessMode;
      description?: string | null;
      exportEnabled?: boolean;
      guestsEnabled?: boolean;
      icon?: unknown;
      invitePolicy?: "owners" | "owners_and_members";
      memberAccessLevel?: "view" | "comment" | "edit" | "full";
      name?: string;
      publicSharingEnabled?: boolean;
      sidebarEditPolicy?: "owners" | "owners_and_members";
      teamspaceId: string;
      workspaceId: string;
    }) => updateTeamspace(context, variables),
  });
}

export function useTeamspaceLifecycle() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: {
      action: "archive" | "restore" | "recover-owner";
      teamspaceId: string;
      workspaceId: string;
    }) => teamspaceLifecycle(context, variables),
  });
}

export function useUpdateTeamspaceDefaults() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: { defaultTeamspaceIds: string[]; workspaceId: string }) =>
      updateTeamspaceDefaults(context, variables),
  });
}

export function useUpdateTeamspaceInviteLink() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: { enabled: boolean; teamspaceId: string; workspaceId: string }) =>
      updateTeamspaceInviteLink(context, variables),
  });
}

export function useAcceptTeamspaceInvite() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: { token: string; workspaceId: string }) =>
      acceptTeamspaceInvite(context, variables),
  });
}

export function useUpdateTeamspaceSettings() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: {
      creationPolicy: "workspace_owners" | "workspace_members";
      workspaceId: string;
    }) => updateTeamspaceSettings(context, variables),
  });
}

export function useSetTeamspaceMembership() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: {
      action: "join" | "leave";
      teamspaceId: string;
      workspaceId: string;
    }) => setTeamspaceMembership(context, variables),
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
