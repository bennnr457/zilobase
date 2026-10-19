import { type ClientOperationContext } from "../shared/operation-context";
import { clientMutation, runClientMutation } from "../shared/operation-mutation";

import { pagesQueryKey } from "../pages/queries";
import type { Teamspace, TeamspaceAccessMode, TeamspaceRole } from "./contracts";
import {
  archivedTeamspacesQueryKey,
  teamspacePrincipalsQueryKey,
  teamspaceSettingsQueryKey,
  teamspacesQueryKey,
} from "./queries";

export type CreateTeamspaceOperationInput = {
  accessMode: TeamspaceAccessMode;
  description?: string | null;
  name: string;
  workspaceId: string;
};
export type CreateTeamspaceOperationResult = Teamspace;
export function createTeamspace(
  context: ClientOperationContext,
  input: CreateTeamspaceOperationInput,
): Promise<CreateTeamspaceOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: (input: CreateTeamspaceOperationInput) =>
        apiFetch<Teamspace>(`/workspaces/${encodeURIComponent(input.workspaceId)}/teamspaces`, {
          body: JSON.stringify({
            accessMode: input.accessMode,
            description: input.description ?? null,
            name: input.name,
          }),
          method: "POST",
        }),
      onSuccess: async (_result, input) => {
        await queryClient.invalidateQueries({
          queryKey: teamspacesQueryKey(input.workspaceId),
        });
      },
    });
  });
}

export type UpdateTeamspaceOperationInput = {
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
};
export type UpdateTeamspaceOperationResult = Teamspace;
export function updateTeamspace(
  context: ClientOperationContext,
  input: UpdateTeamspaceOperationInput,
): Promise<UpdateTeamspaceOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: (input: UpdateTeamspaceOperationInput) => {
        const { teamspaceId, workspaceId, ...body } = input;
        return apiFetch<Teamspace>(
          `/workspaces/${encodeURIComponent(workspaceId)}/teamspaces/${encodeURIComponent(teamspaceId)}`,
          { body: JSON.stringify(body), method: "PATCH" },
        );
      },
      onSuccess: async (_result, input) => {
        await queryClient.invalidateQueries({
          queryKey: teamspacesQueryKey(input.workspaceId),
        });
      },
    });
  });
}

export type TeamspaceLifecycleOperationInput = {
  action: "archive" | "restore" | "recover-owner";
  teamspaceId: string;
  workspaceId: string;
};
export type TeamspaceLifecycleOperationResult = unknown;
export function teamspaceLifecycle(
  context: ClientOperationContext,
  input: TeamspaceLifecycleOperationInput,
): Promise<TeamspaceLifecycleOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: (input: TeamspaceLifecycleOperationInput) =>
        apiFetch(
          `/workspaces/${encodeURIComponent(input.workspaceId)}/teamspaces/${encodeURIComponent(input.teamspaceId)}/${input.action}`,
          { method: "POST" },
        ),
      onSuccess: async (_result, input) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: teamspacesQueryKey(input.workspaceId) }),
          queryClient.invalidateQueries({
            queryKey: archivedTeamspacesQueryKey(input.workspaceId),
          }),
          queryClient.invalidateQueries({ queryKey: pagesQueryKey(input.workspaceId) }),
        ]);
      },
    });
  });
}

export type UpdateTeamspaceDefaultsOperationInput = {
  defaultTeamspaceIds: string[];
  workspaceId: string;
};
export type UpdateTeamspaceDefaultsOperationResult = unknown;
export function updateTeamspaceDefaults(
  context: ClientOperationContext,
  input: UpdateTeamspaceDefaultsOperationInput,
): Promise<UpdateTeamspaceDefaultsOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: (input: UpdateTeamspaceDefaultsOperationInput) =>
        apiFetch(`/workspaces/${encodeURIComponent(input.workspaceId)}/teamspace-defaults`, {
          body: JSON.stringify({ defaultTeamspaceIds: input.defaultTeamspaceIds }),
          method: "PATCH",
        }),
      onSuccess: async (_result, input) => {
        await queryClient.invalidateQueries({ queryKey: teamspacesQueryKey(input.workspaceId) });
      },
    });
  });
}

export type UpdateTeamspaceInviteLinkOperationInput = {
  enabled: boolean;
  teamspaceId: string;
  workspaceId: string;
};
export type UpdateTeamspaceInviteLinkOperationResult = { enabled: boolean; token: string | null };
export function updateTeamspaceInviteLink(
  context: ClientOperationContext,
  input: UpdateTeamspaceInviteLinkOperationInput,
): Promise<UpdateTeamspaceInviteLinkOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: (input: UpdateTeamspaceInviteLinkOperationInput) =>
        apiFetch<{ enabled: boolean; token: string | null }>(
          `/workspaces/${encodeURIComponent(input.workspaceId)}/teamspaces/${encodeURIComponent(input.teamspaceId)}/invite-link`,
          { body: JSON.stringify({ enabled: input.enabled }), method: "PATCH" },
        ),
      onSuccess: async (_result, input) => {
        await queryClient.invalidateQueries({ queryKey: teamspacesQueryKey(input.workspaceId) });
      },
    });
  });
}

export type AcceptTeamspaceInviteOperationInput = { token: string; workspaceId: string };
export type AcceptTeamspaceInviteOperationResult = { teamspaceId: string };
export function acceptTeamspaceInvite(
  context: ClientOperationContext,
  input: AcceptTeamspaceInviteOperationInput,
): Promise<AcceptTeamspaceInviteOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: (input: AcceptTeamspaceInviteOperationInput) =>
        apiFetch<{ teamspaceId: string }>(
          `/workspaces/${encodeURIComponent(input.workspaceId)}/teamspace-invites/${encodeURIComponent(input.token)}/accept`,
          { method: "POST" },
        ),
      onSuccess: async (_result, input) => {
        await queryClient.invalidateQueries({ queryKey: teamspacesQueryKey(input.workspaceId) });
      },
    });
  });
}

export type UpdateTeamspaceSettingsOperationInput = {
  creationPolicy: "workspace_owners" | "workspace_members";
  workspaceId: string;
};
export type UpdateTeamspaceSettingsOperationResult = unknown;
export function updateTeamspaceSettings(
  context: ClientOperationContext,
  input: UpdateTeamspaceSettingsOperationInput,
): Promise<UpdateTeamspaceSettingsOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: (input: UpdateTeamspaceSettingsOperationInput) =>
        apiFetch(`/workspaces/${encodeURIComponent(input.workspaceId)}/teamspace-settings`, {
          body: JSON.stringify({ creationPolicy: input.creationPolicy }),
          method: "PATCH",
        }),
      onSuccess: async (_result, input) => {
        await queryClient.invalidateQueries({
          queryKey: teamspaceSettingsQueryKey(input.workspaceId),
        });
      },
    });
  });
}

export type SetTeamspaceMembershipOperationInput = {
  action: "join" | "leave";
  teamspaceId: string;
  workspaceId: string;
};
export type SetTeamspaceMembershipOperationResult = unknown;
export function setTeamspaceMembership(
  context: ClientOperationContext,
  input: SetTeamspaceMembershipOperationInput,
): Promise<SetTeamspaceMembershipOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: (input: SetTeamspaceMembershipOperationInput) =>
        apiFetch(
          `/workspaces/${encodeURIComponent(input.workspaceId)}/teamspaces/${encodeURIComponent(input.teamspaceId)}/${input.action}`,
          { method: "POST" },
        ),
      onSuccess: async (_result, input) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: teamspacesQueryKey(input.workspaceId) }),
          queryClient.invalidateQueries({ queryKey: pagesQueryKey(input.workspaceId) }),
        ]);
      },
    });
  });
}

function principalMutation(context: ClientOperationContext, method: "POST" | "PATCH" | "DELETE") {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: (input: {
      accessLevelOverride?: "view" | "comment" | "edit" | "full" | null;
      principalId?: string;
      principalType?: "user" | "team";
      role?: TeamspaceRole;
      teamspaceId: string;
      userId?: string;
      workspaceId: string;
    }) => {
      const suffix = input.principalId ? `/${encodeURIComponent(input.principalId)}` : "";
      return apiFetch(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/teamspaces/${encodeURIComponent(input.teamspaceId)}/principals${suffix}`,
        {
          body:
            method === "DELETE"
              ? undefined
              : JSON.stringify({
                  accessLevelOverride: input.accessLevelOverride,
                  principalType: input.principalType,
                  role: input.role,
                  userId: input.userId,
                }),
          method,
        },
      );
    },
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: teamspacesQueryKey(input.workspaceId) }),
        queryClient.invalidateQueries({
          queryKey: teamspacePrincipalsQueryKey(input.workspaceId, input.teamspaceId),
        }),
      ]);
    },
  });
}

export type AddTeamspacePrincipalOperationInput = Parameters<
  NonNullable<ReturnType<typeof principalMutation>["mutationFn"]>
>[0];
export function addTeamspacePrincipal(
  context: ClientOperationContext,
  input: AddTeamspacePrincipalOperationInput,
) {
  return runClientMutation(context, input, (context) => principalMutation(context, "POST"));
}
export type UpdateTeamspacePrincipalOperationInput = Parameters<
  NonNullable<ReturnType<typeof principalMutation>["mutationFn"]>
>[0];
export function updateTeamspacePrincipal(
  context: ClientOperationContext,
  input: UpdateTeamspacePrincipalOperationInput,
) {
  return runClientMutation(context, input, (context) => principalMutation(context, "PATCH"));
}
export type RemoveTeamspacePrincipalOperationInput = Parameters<
  NonNullable<ReturnType<typeof principalMutation>["mutationFn"]>
>[0];
export function removeTeamspacePrincipal(
  context: ClientOperationContext,
  input: RemoveTeamspacePrincipalOperationInput,
) {
  return runClientMutation(context, input, (context) => principalMutation(context, "DELETE"));
}

export type AddTeamspacePrincipalResult = Awaited<ReturnType<typeof addTeamspacePrincipal>>;
export type UpdateTeamspacePrincipalResult = Awaited<ReturnType<typeof updateTeamspacePrincipal>>;
export type RemoveTeamspacePrincipalResult = Awaited<ReturnType<typeof removeTeamspacePrincipal>>;
