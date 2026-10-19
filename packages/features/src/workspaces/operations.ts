import {
  type AuthenticatedClientOperationContext,
  type ClientOperationContext,
} from "../shared/operation-context";
import { clientMutation, runClientMutation } from "../shared/operation-mutation";

import { sessionQueryKey, sessionQueryOptions } from "../auth/queries";
import { pageRootQueryKey, pagesRootQueryKey } from "../pages/queries";
import type {
  AcceptWorkspaceInvitationResponse,
  GuestInviteMode,
  InvitableWorkspaceRole,
  Workspace,
  WorkspaceMemberMutationResponse,
  WorkspaceRole,
} from "./contracts";
import {
  workspaceAccessTargetsQueryKey,
  workspaceGuestPolicyQueryKey,
  workspaceGuestRequestsQueryKey,
  workspaceGuestsQueryKey,
  workspaceInvitationsQueryKey,
  workspacesQueryKey,
} from "./queries";

function defineUpdateWorkspaceGuestPolicyMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: (input: { mode: GuestInviteMode; workspaceId: string }) =>
      apiFetch(`/workspaces/${encodeURIComponent(input.workspaceId)}/guest-policy`, {
        body: JSON.stringify({ mode: input.mode }),
        method: "PATCH",
      }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: workspaceGuestPolicyQueryKey(input.workspaceId),
      });
    },
  });
}
export type UpdateWorkspaceGuestPolicyOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineUpdateWorkspaceGuestPolicyMutation>["mutationFn"]>
>[0];
export type UpdateWorkspaceGuestPolicyOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdateWorkspaceGuestPolicyMutation>["mutationFn"]>>
>;
export function updateWorkspaceGuestPolicy(
  context: ClientOperationContext,
  input: UpdateWorkspaceGuestPolicyOperationInput,
): Promise<UpdateWorkspaceGuestPolicyOperationResult> {
  return runClientMutation(context, input, (context) =>
    defineUpdateWorkspaceGuestPolicyMutation(context),
  );
}

function defineReviewWorkspaceGuestRequestMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: (input: { action: "approve" | "reject"; requestId: string; workspaceId: string }) =>
      apiFetch(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/guest-requests/${encodeURIComponent(input.requestId)}/${input.action}`,
        { method: "POST" },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: workspaceGuestRequestsQueryKey(input.workspaceId),
      });
    },
  });
}
export type ReviewWorkspaceGuestRequestOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineReviewWorkspaceGuestRequestMutation>["mutationFn"]>
>[0];
export type ReviewWorkspaceGuestRequestOperationResult = Awaited<
  ReturnType<
    NonNullable<ReturnType<typeof defineReviewWorkspaceGuestRequestMutation>["mutationFn"]>
  >
>;
export function reviewWorkspaceGuestRequest(
  context: ClientOperationContext,
  input: ReviewWorkspaceGuestRequestOperationInput,
): Promise<ReviewWorkspaceGuestRequestOperationResult> {
  return runClientMutation(context, input, (context) =>
    defineReviewWorkspaceGuestRequestMutation(context),
  );
}

function definePromoteWorkspaceGuestMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: (input: { userId: string; workspaceId: string }) =>
      apiFetch(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/guests/${encodeURIComponent(input.userId)}/promote`,
        { method: "POST" },
      ),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workspaceGuestsQueryKey(input.workspaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: workspaceAccessTargetsQueryKey(input.workspaceId),
        }),
      ]);
    },
  });
}
export type PromoteWorkspaceGuestOperationInput = Parameters<
  NonNullable<ReturnType<typeof definePromoteWorkspaceGuestMutation>["mutationFn"]>
>[0];
export type PromoteWorkspaceGuestOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof definePromoteWorkspaceGuestMutation>["mutationFn"]>>
>;
export function promoteWorkspaceGuest(
  context: ClientOperationContext,
  input: PromoteWorkspaceGuestOperationInput,
): Promise<PromoteWorkspaceGuestOperationResult> {
  return runClientMutation(context, input, (context) =>
    definePromoteWorkspaceGuestMutation(context),
  );
}

function defineRevokeWorkspaceGuestMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: (input: { userId: string; workspaceId: string }) =>
      apiFetch<{ guest: unknown }>(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/guests/${encodeURIComponent(input.userId)}`,
        { method: "DELETE" },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: workspaceGuestsQueryKey(input.workspaceId),
      });
    },
  });
}
export type RevokeWorkspaceGuestOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineRevokeWorkspaceGuestMutation>["mutationFn"]>
>[0];
export type RevokeWorkspaceGuestOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineRevokeWorkspaceGuestMutation>["mutationFn"]>>
>;
export function revokeWorkspaceGuest(
  context: ClientOperationContext,
  input: RevokeWorkspaceGuestOperationInput,
): Promise<RevokeWorkspaceGuestOperationResult> {
  return runClientMutation(context, input, (context) =>
    defineRevokeWorkspaceGuestMutation(context),
  );
}

function defineCreateWorkspaceMutation(context: AuthenticatedClientOperationContext) {
  const { auth, queryClient, setPreferredActiveWorkspaceId } = context;

  return clientMutation({
    mutationFn: (name: string) =>
      auth.createWorkspace<Workspace>({
        name,
        slug: createSlug(name),
      }),
    onSuccess: async (workspace) => {
      setPreferredActiveWorkspaceId?.(workspace.id);
      await auth.setActiveWorkspace(workspace.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspacesQueryKey }),
        queryClient.fetchQuery({
          ...sessionQueryOptions(auth),
          staleTime: 0,
        }),
      ]);
    },
  });
}
export type CreateWorkspaceOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineCreateWorkspaceMutation>["mutationFn"]>
>[0];
export type CreateWorkspaceOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineCreateWorkspaceMutation>["mutationFn"]>>
>;
export function createWorkspace(
  context: AuthenticatedClientOperationContext,
  input: CreateWorkspaceOperationInput,
): Promise<CreateWorkspaceOperationResult> {
  return runClientMutation(context, input, (context) => defineCreateWorkspaceMutation(context));
}

function defineInviteWorkspaceMemberMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: (input: {
      accessExpiresAt?: string | null;
      email: string;
      workspaceId: string;
      role: InvitableWorkspaceRole;
    }) =>
      apiFetch<{ invitation: unknown }>(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/member-invitations`,
        {
          body: JSON.stringify({
            accessExpiresAt: input.accessExpiresAt ?? null,
            email: input.email,
            role: input.role,
          }),
          method: "POST",
        },
      ),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workspaceInvitationsQueryKey(input.workspaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: workspaceAccessTargetsQueryKey(input.workspaceId),
        }),
      ]);
    },
  });
}
export type InviteWorkspaceMemberOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineInviteWorkspaceMemberMutation>["mutationFn"]>
>[0];
export type InviteWorkspaceMemberOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineInviteWorkspaceMemberMutation>["mutationFn"]>>
>;
export function inviteWorkspaceMember(
  context: ClientOperationContext,
  input: InviteWorkspaceMemberOperationInput,
): Promise<InviteWorkspaceMemberOperationResult> {
  return runClientMutation(context, input, (context) =>
    defineInviteWorkspaceMemberMutation(context),
  );
}

function defineUpdateWorkspaceMemberMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: (input: {
      accessExpiresAt?: string | null;
      memberId: string;
      role: WorkspaceRole;
      workspaceId: string;
    }) =>
      apiFetch<WorkspaceMemberMutationResponse>(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/members/${encodeURIComponent(input.memberId)}`,
        {
          body: JSON.stringify({
            accessExpiresAt: input.accessExpiresAt ?? null,
            role: input.role,
          }),
          method: "PATCH",
        },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: workspaceAccessTargetsQueryKey(input.workspaceId),
      });
    },
  });
}
export type UpdateWorkspaceMemberOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineUpdateWorkspaceMemberMutation>["mutationFn"]>
>[0];
export type UpdateWorkspaceMemberOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdateWorkspaceMemberMutation>["mutationFn"]>>
>;
export function updateWorkspaceMember(
  context: ClientOperationContext,
  input: UpdateWorkspaceMemberOperationInput,
): Promise<UpdateWorkspaceMemberOperationResult> {
  return runClientMutation(context, input, (context) =>
    defineUpdateWorkspaceMemberMutation(context),
  );
}

function defineRemoveWorkspaceMemberMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: (input: { memberId: string; workspaceId: string }) =>
      apiFetch<{ removed: boolean }>(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/members/${encodeURIComponent(input.memberId)}`,
        { method: "DELETE" },
      ),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workspaceAccessTargetsQueryKey(input.workspaceId),
        }),
        queryClient.invalidateQueries({ queryKey: workspacesQueryKey }),
      ]);
    },
  });
}
export type RemoveWorkspaceMemberOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineRemoveWorkspaceMemberMutation>["mutationFn"]>
>[0];
export type RemoveWorkspaceMemberOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineRemoveWorkspaceMemberMutation>["mutationFn"]>>
>;
export function removeWorkspaceMember(
  context: ClientOperationContext,
  input: RemoveWorkspaceMemberOperationInput,
): Promise<RemoveWorkspaceMemberOperationResult> {
  return runClientMutation(context, input, (context) =>
    defineRemoveWorkspaceMemberMutation(context),
  );
}

function defineAcceptWorkspaceInvitationMutation(context: AuthenticatedClientOperationContext) {
  const { auth, queryClient, setPreferredActiveWorkspaceId } = context;

  return clientMutation({
    mutationFn: (invitationId: string) =>
      auth.acceptWorkspaceInvitation<AcceptWorkspaceInvitationResponse>({
        invitationId,
      }),
    onSuccess: async (result) => {
      setPreferredActiveWorkspaceId?.(result.invitation.workspaceId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspacesQueryKey }),
        queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
      ]);
      await queryClient.fetchQuery({
        ...sessionQueryOptions(auth),
        staleTime: 0,
      });
    },
  });
}
export type AcceptWorkspaceInvitationOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineAcceptWorkspaceInvitationMutation>["mutationFn"]>
>[0];
export type AcceptWorkspaceInvitationOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineAcceptWorkspaceInvitationMutation>["mutationFn"]>>
>;
export function acceptWorkspaceInvitation(
  context: AuthenticatedClientOperationContext,
  input: AcceptWorkspaceInvitationOperationInput,
): Promise<AcceptWorkspaceInvitationOperationResult> {
  return runClientMutation(context, input, (context) =>
    defineAcceptWorkspaceInvitationMutation(context),
  );
}

function defineSetActiveWorkspaceMutation(context: AuthenticatedClientOperationContext) {
  const { auth, queryClient, setPreferredActiveWorkspaceId } = context;

  return clientMutation({
    mutationFn: (workspaceId: string) => auth.setActiveWorkspace(workspaceId),
    onSuccess: async (_result, workspaceId) => {
      setPreferredActiveWorkspaceId?.(workspaceId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
        queryClient.invalidateQueries({ queryKey: pageRootQueryKey() }),
        queryClient.invalidateQueries({ queryKey: pagesRootQueryKey() }),
      ]);
      await queryClient.fetchQuery({
        ...sessionQueryOptions(auth),
        staleTime: 0,
      });
    },
  });
}
export type SetActiveWorkspaceOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineSetActiveWorkspaceMutation>["mutationFn"]>
>[0];
export type SetActiveWorkspaceOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineSetActiveWorkspaceMutation>["mutationFn"]>>
>;
export function setActiveWorkspace(
  context: AuthenticatedClientOperationContext,
  input: SetActiveWorkspaceOperationInput,
): Promise<SetActiveWorkspaceOperationResult> {
  return runClientMutation(context, input, (context) => defineSetActiveWorkspaceMutation(context));
}

function defineUpdateWorkspaceMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: ({
      workspaceId,
      ...input
    }: {
      workspaceId: string;
      logo?: string | null;
      metadata?: string | null;
      name?: string;
      slug?: string;
    }) =>
      apiFetch<Workspace>(`/workspaces/${encodeURIComponent(workspaceId)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (updatedWorkspace) => {
      queryClient.setQueryData<Workspace[]>(workspacesQueryKey, (current = []) => {
        const hasMatch = current.some((workspace) => workspace.id === updatedWorkspace.id);

        if (!hasMatch) {
          return [...current, updatedWorkspace];
        }

        return current.map((workspace) =>
          workspace.id === updatedWorkspace.id ? updatedWorkspace : workspace,
        );
      });
    },
  });
}
export type UpdateWorkspaceOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineUpdateWorkspaceMutation>["mutationFn"]>
>[0];
export type UpdateWorkspaceOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdateWorkspaceMutation>["mutationFn"]>>
>;
export function updateWorkspace(
  context: ClientOperationContext,
  input: UpdateWorkspaceOperationInput,
): Promise<UpdateWorkspaceOperationResult> {
  return runClientMutation(context, input, (context) => defineUpdateWorkspaceMutation(context));
}

function defineDeleteWorkspaceMutation(context: AuthenticatedClientOperationContext) {
  const { apiFetch, auth, queryClient, setPreferredActiveWorkspaceId } = context;

  return clientMutation({
    mutationFn: (input: { confirmationName: string; workspaceId: string }) =>
      apiFetch<{ deleted: boolean; workspaceId: string }>(
        `/workspaces/${encodeURIComponent(input.workspaceId)}`,
        {
          body: JSON.stringify({ confirmationName: input.confirmationName }),
          method: "DELETE",
        },
      ),
    onSuccess: async (_result, input) => {
      const remaining = (queryClient.getQueryData<Workspace[]>(workspacesQueryKey) ?? []).filter(
        (workspace) => workspace.id !== input.workspaceId,
      );
      const nextWorkspace = remaining[0] ?? null;

      queryClient.setQueryData(workspacesQueryKey, remaining);
      setPreferredActiveWorkspaceId?.(nextWorkspace?.id ?? null);

      if (nextWorkspace) {
        await auth.setActiveWorkspace(nextWorkspace.id);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
        queryClient.invalidateQueries({ queryKey: pageRootQueryKey() }),
        queryClient.invalidateQueries({ queryKey: pagesRootQueryKey() }),
      ]);
    },
  });
}
export type DeleteWorkspaceOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineDeleteWorkspaceMutation>["mutationFn"]>
>[0];
export type DeleteWorkspaceOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineDeleteWorkspaceMutation>["mutationFn"]>>
>;
export function deleteWorkspace(
  context: AuthenticatedClientOperationContext,
  input: DeleteWorkspaceOperationInput,
): Promise<DeleteWorkspaceOperationResult> {
  return runClientMutation(context, input, (context) => defineDeleteWorkspaceMutation(context));
}

function createSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug ? `${slug}-${Date.now().toString(36)}` : `page-${Date.now().toString(36)}`;
}
