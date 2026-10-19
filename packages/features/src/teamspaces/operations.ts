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

function defineCreateTeamspaceMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: (input: {
      accessMode: TeamspaceAccessMode;
      description?: string | null;
      name: string;
      workspaceId: string;
    }) =>
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
}
export type CreateTeamspaceOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineCreateTeamspaceMutation>["mutationFn"]>
>[0];
export type CreateTeamspaceOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineCreateTeamspaceMutation>["mutationFn"]>>
>;
export function createTeamspace(
  context: ClientOperationContext,
  input: CreateTeamspaceOperationInput,
): Promise<CreateTeamspaceOperationResult> {
  return runClientMutation(context, input, (context) => defineCreateTeamspaceMutation(context));
}

function defineUpdateTeamspaceMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: (input: {
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
    }) => {
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
}
export type UpdateTeamspaceOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineUpdateTeamspaceMutation>["mutationFn"]>
>[0];
export type UpdateTeamspaceOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdateTeamspaceMutation>["mutationFn"]>>
>;
export function updateTeamspace(
  context: ClientOperationContext,
  input: UpdateTeamspaceOperationInput,
): Promise<UpdateTeamspaceOperationResult> {
  return runClientMutation(context, input, (context) => defineUpdateTeamspaceMutation(context));
}

function defineTeamspaceLifecycleMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: (input: {
      action: "archive" | "restore" | "recover-owner";
      teamspaceId: string;
      workspaceId: string;
    }) =>
      apiFetch(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/teamspaces/${encodeURIComponent(input.teamspaceId)}/${input.action}`,
        { method: "POST" },
      ),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: teamspacesQueryKey(input.workspaceId) }),
        queryClient.invalidateQueries({ queryKey: archivedTeamspacesQueryKey(input.workspaceId) }),
        queryClient.invalidateQueries({ queryKey: pagesQueryKey(input.workspaceId) }),
      ]);
    },
  });
}
export type TeamspaceLifecycleOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineTeamspaceLifecycleMutation>["mutationFn"]>
>[0];
export type TeamspaceLifecycleOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineTeamspaceLifecycleMutation>["mutationFn"]>>
>;
export function teamspaceLifecycle(
  context: ClientOperationContext,
  input: TeamspaceLifecycleOperationInput,
): Promise<TeamspaceLifecycleOperationResult> {
  return runClientMutation(context, input, (context) => defineTeamspaceLifecycleMutation(context));
}

function defineUpdateTeamspaceDefaultsMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: (input: { defaultTeamspaceIds: string[]; workspaceId: string }) =>
      apiFetch(`/workspaces/${encodeURIComponent(input.workspaceId)}/teamspace-defaults`, {
        body: JSON.stringify({ defaultTeamspaceIds: input.defaultTeamspaceIds }),
        method: "PATCH",
      }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey: teamspacesQueryKey(input.workspaceId) });
    },
  });
}
export type UpdateTeamspaceDefaultsOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineUpdateTeamspaceDefaultsMutation>["mutationFn"]>
>[0];
export type UpdateTeamspaceDefaultsOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdateTeamspaceDefaultsMutation>["mutationFn"]>>
>;
export function updateTeamspaceDefaults(
  context: ClientOperationContext,
  input: UpdateTeamspaceDefaultsOperationInput,
): Promise<UpdateTeamspaceDefaultsOperationResult> {
  return runClientMutation(context, input, (context) =>
    defineUpdateTeamspaceDefaultsMutation(context),
  );
}

function defineUpdateTeamspaceInviteLinkMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: (input: { enabled: boolean; teamspaceId: string; workspaceId: string }) =>
      apiFetch<{ enabled: boolean; token: string | null }>(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/teamspaces/${encodeURIComponent(input.teamspaceId)}/invite-link`,
        { body: JSON.stringify({ enabled: input.enabled }), method: "PATCH" },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey: teamspacesQueryKey(input.workspaceId) });
    },
  });
}
export type UpdateTeamspaceInviteLinkOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineUpdateTeamspaceInviteLinkMutation>["mutationFn"]>
>[0];
export type UpdateTeamspaceInviteLinkOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdateTeamspaceInviteLinkMutation>["mutationFn"]>>
>;
export function updateTeamspaceInviteLink(
  context: ClientOperationContext,
  input: UpdateTeamspaceInviteLinkOperationInput,
): Promise<UpdateTeamspaceInviteLinkOperationResult> {
  return runClientMutation(context, input, (context) =>
    defineUpdateTeamspaceInviteLinkMutation(context),
  );
}

function defineAcceptTeamspaceInviteMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: (input: { token: string; workspaceId: string }) =>
      apiFetch<{ teamspaceId: string }>(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/teamspace-invites/${encodeURIComponent(input.token)}/accept`,
        { method: "POST" },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey: teamspacesQueryKey(input.workspaceId) });
    },
  });
}
export type AcceptTeamspaceInviteOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineAcceptTeamspaceInviteMutation>["mutationFn"]>
>[0];
export type AcceptTeamspaceInviteOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineAcceptTeamspaceInviteMutation>["mutationFn"]>>
>;
export function acceptTeamspaceInvite(
  context: ClientOperationContext,
  input: AcceptTeamspaceInviteOperationInput,
): Promise<AcceptTeamspaceInviteOperationResult> {
  return runClientMutation(context, input, (context) =>
    defineAcceptTeamspaceInviteMutation(context),
  );
}

function defineUpdateTeamspaceSettingsMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: (input: {
      creationPolicy: "workspace_owners" | "workspace_members";
      workspaceId: string;
    }) =>
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
}
export type UpdateTeamspaceSettingsOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineUpdateTeamspaceSettingsMutation>["mutationFn"]>
>[0];
export type UpdateTeamspaceSettingsOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdateTeamspaceSettingsMutation>["mutationFn"]>>
>;
export function updateTeamspaceSettings(
  context: ClientOperationContext,
  input: UpdateTeamspaceSettingsOperationInput,
): Promise<UpdateTeamspaceSettingsOperationResult> {
  return runClientMutation(context, input, (context) =>
    defineUpdateTeamspaceSettingsMutation(context),
  );
}

function defineSetTeamspaceMembershipMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: (input: { action: "join" | "leave"; teamspaceId: string; workspaceId: string }) =>
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
}
export type SetTeamspaceMembershipOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineSetTeamspaceMembershipMutation>["mutationFn"]>
>[0];
export type SetTeamspaceMembershipOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineSetTeamspaceMembershipMutation>["mutationFn"]>>
>;
export function setTeamspaceMembership(
  context: ClientOperationContext,
  input: SetTeamspaceMembershipOperationInput,
): Promise<SetTeamspaceMembershipOperationResult> {
  return runClientMutation(context, input, (context) =>
    defineSetTeamspaceMembershipMutation(context),
  );
}

function definePrincipalMutationMutation(
  context: ClientOperationContext,
  method: "POST" | "PATCH" | "DELETE",
) {
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
  NonNullable<ReturnType<typeof definePrincipalMutationMutation>["mutationFn"]>
>[0];
export function addTeamspacePrincipal(
  context: ClientOperationContext,
  input: AddTeamspacePrincipalOperationInput,
) {
  return runClientMutation(context, input, (context) =>
    definePrincipalMutationMutation(context, "POST"),
  );
}
export type UpdateTeamspacePrincipalOperationInput = Parameters<
  NonNullable<ReturnType<typeof definePrincipalMutationMutation>["mutationFn"]>
>[0];
export function updateTeamspacePrincipal(
  context: ClientOperationContext,
  input: UpdateTeamspacePrincipalOperationInput,
) {
  return runClientMutation(context, input, (context) =>
    definePrincipalMutationMutation(context, "PATCH"),
  );
}
export type RemoveTeamspacePrincipalOperationInput = Parameters<
  NonNullable<ReturnType<typeof definePrincipalMutationMutation>["mutationFn"]>
>[0];
export function removeTeamspacePrincipal(
  context: ClientOperationContext,
  input: RemoveTeamspacePrincipalOperationInput,
) {
  return runClientMutation(context, input, (context) =>
    definePrincipalMutationMutation(context, "DELETE"),
  );
}

export type AddTeamspacePrincipalResult = Awaited<ReturnType<typeof addTeamspacePrincipal>>;
export type UpdateTeamspacePrincipalResult = Awaited<ReturnType<typeof updateTeamspacePrincipal>>;
export type RemoveTeamspacePrincipalResult = Awaited<ReturnType<typeof removeTeamspacePrincipal>>;
