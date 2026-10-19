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

export type UpdateWorkspaceGuestPolicyOperationInput = {
  mode: GuestInviteMode;
  workspaceId: string;
};
export type UpdateWorkspaceGuestPolicyOperationResult = unknown;
export function updateWorkspaceGuestPolicy(
  context: ClientOperationContext,
  input: UpdateWorkspaceGuestPolicyOperationInput,
): Promise<UpdateWorkspaceGuestPolicyOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: (input: UpdateWorkspaceGuestPolicyOperationInput) =>
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
  });
}

export type ReviewWorkspaceGuestRequestOperationInput = {
  action: "approve" | "reject";
  requestId: string;
  workspaceId: string;
};
export type ReviewWorkspaceGuestRequestOperationResult = unknown;
export function reviewWorkspaceGuestRequest(
  context: ClientOperationContext,
  input: ReviewWorkspaceGuestRequestOperationInput,
): Promise<ReviewWorkspaceGuestRequestOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: (input: ReviewWorkspaceGuestRequestOperationInput) =>
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
  });
}

export type PromoteWorkspaceGuestOperationInput = { userId: string; workspaceId: string };
export type PromoteWorkspaceGuestOperationResult = unknown;
export function promoteWorkspaceGuest(
  context: ClientOperationContext,
  input: PromoteWorkspaceGuestOperationInput,
): Promise<PromoteWorkspaceGuestOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: (input: PromoteWorkspaceGuestOperationInput) =>
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
  });
}

export type RevokeWorkspaceGuestOperationInput = { userId: string; workspaceId: string };
export type RevokeWorkspaceGuestOperationResult = { guest: unknown };
export function revokeWorkspaceGuest(
  context: ClientOperationContext,
  input: RevokeWorkspaceGuestOperationInput,
): Promise<RevokeWorkspaceGuestOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;

    return clientMutation({
      mutationFn: (input: RevokeWorkspaceGuestOperationInput) =>
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
  });
}

export type CreateWorkspaceOperationInput = string;
export type CreateWorkspaceOperationResult = Workspace;
export function createWorkspace(
  context: AuthenticatedClientOperationContext,
  input: CreateWorkspaceOperationInput,
): Promise<CreateWorkspaceOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { auth, queryClient, setPreferredActiveWorkspaceId } = context;

    return clientMutation({
      mutationFn: (name: CreateWorkspaceOperationInput) =>
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
  });
}

export type InviteWorkspaceMemberOperationInput = {
  accessExpiresAt?: string | null;
  email: string;
  workspaceId: string;
  role: InvitableWorkspaceRole;
};
export type InviteWorkspaceMemberOperationResult = { invitation: unknown };
export function inviteWorkspaceMember(
  context: ClientOperationContext,
  input: InviteWorkspaceMemberOperationInput,
): Promise<InviteWorkspaceMemberOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;

    return clientMutation({
      mutationFn: (input: InviteWorkspaceMemberOperationInput) =>
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
  });
}

export type UpdateWorkspaceMemberOperationInput = {
  accessExpiresAt?: string | null;
  memberId: string;
  role: WorkspaceRole;
  workspaceId: string;
};
export type UpdateWorkspaceMemberOperationResult = WorkspaceMemberMutationResponse;
export function updateWorkspaceMember(
  context: ClientOperationContext,
  input: UpdateWorkspaceMemberOperationInput,
): Promise<UpdateWorkspaceMemberOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;

    return clientMutation({
      mutationFn: (input: UpdateWorkspaceMemberOperationInput) =>
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
  });
}

export type RemoveWorkspaceMemberOperationInput = { memberId: string; workspaceId: string };
export type RemoveWorkspaceMemberOperationResult = { removed: boolean };
export function removeWorkspaceMember(
  context: ClientOperationContext,
  input: RemoveWorkspaceMemberOperationInput,
): Promise<RemoveWorkspaceMemberOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;

    return clientMutation({
      mutationFn: (input: RemoveWorkspaceMemberOperationInput) =>
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
  });
}

export type AcceptWorkspaceInvitationOperationInput = string;
export type AcceptWorkspaceInvitationOperationResult = AcceptWorkspaceInvitationResponse;
export function acceptWorkspaceInvitation(
  context: AuthenticatedClientOperationContext,
  input: AcceptWorkspaceInvitationOperationInput,
): Promise<AcceptWorkspaceInvitationOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { auth, queryClient, setPreferredActiveWorkspaceId } = context;

    return clientMutation({
      mutationFn: (invitationId: AcceptWorkspaceInvitationOperationInput) =>
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
  });
}

export type SetActiveWorkspaceOperationInput = string;
export type SetActiveWorkspaceOperationResult = unknown;
export function setActiveWorkspace(
  context: AuthenticatedClientOperationContext,
  input: SetActiveWorkspaceOperationInput,
): Promise<SetActiveWorkspaceOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { auth, queryClient, setPreferredActiveWorkspaceId } = context;

    return clientMutation({
      mutationFn: (workspaceId: SetActiveWorkspaceOperationInput) =>
        auth.setActiveWorkspace(workspaceId),
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
  });
}

export type UpdateWorkspaceOperationInput = {
  workspaceId: string;
  logo?: string | null;
  metadata?: string | null;
  name?: string;
  slug?: string;
};
export type UpdateWorkspaceOperationResult = Workspace;
export function updateWorkspace(
  context: ClientOperationContext,
  input: UpdateWorkspaceOperationInput,
): Promise<UpdateWorkspaceOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;

    return clientMutation({
      mutationFn: ({ workspaceId, ...input }: UpdateWorkspaceOperationInput) =>
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
  });
}

export type DeleteWorkspaceOperationInput = { confirmationName: string; workspaceId: string };
export type DeleteWorkspaceOperationResult = { deleted: boolean; workspaceId: string };
export function deleteWorkspace(
  context: AuthenticatedClientOperationContext,
  input: DeleteWorkspaceOperationInput,
): Promise<DeleteWorkspaceOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, auth, queryClient, setPreferredActiveWorkspaceId } = context;

    return clientMutation({
      mutationFn: (input: DeleteWorkspaceOperationInput) =>
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
  });
}

function createSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug ? `${slug}-${Date.now().toString(36)}` : `page-${Date.now().toString(36)}`;
}
