import type { QueryClient } from "@tanstack/react-query";
import type { ClientOperationContext } from "../shared/operation-context";
import { clientMutation, runClientMutation } from "../shared/operation-mutation";
import type { AccessLevel, AccessTargetType } from "./contracts";
import {
  pageAccessQueryKey,
  pageGuestInvitationQueryKey,
  pageGuestInvitationsQueryKey,
  pageGuestRequestsQueryKey,
  pagePersonAccessTargetsQueryKey,
  pageQueryKey,
} from "./queries";
export type UpsertPageAccessInput = {
  accessLevel: AccessLevel;
  targetId: string;
  targetType: AccessTargetType;
  pageId: string;
};

export type SetPagePublishedInput = {
  isPublished: boolean;
  pageId: string;
};

function defineUpsertPageAccessMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: async ({ accessLevel, targetId, targetType, pageId }: UpsertPageAccessInput) => {
      const result = await apiFetch<{ access: unknown }>(`/pages/${pageId}/access`, {
        method: "PUT",
        body: JSON.stringify({ accessLevel, targetId, targetType }),
      });

      return result.access;
    },
    onSuccess: async (_access, variables) => {
      await invalidatePageAccess(queryClient, variables.pageId);
    },
  });
}
export type UpsertPageAccessResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpsertPageAccessMutation>["mutationFn"]>>
>;
export function upsertPageAccess(
  context: ClientOperationContext,
  input: UpsertPageAccessInput,
): Promise<UpsertPageAccessResult> {
  return runClientMutation(context, input, defineUpsertPageAccessMutation);
}

function defineDeletePageAccessMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: async ({ ruleId, pageId }: { ruleId: string; pageId: string }) =>
      apiFetch<{ access: unknown }>(`/pages/${pageId}/access/${ruleId}`, {
        method: "DELETE",
      }),
    onSuccess: async (_access, variables) => {
      await invalidatePageAccess(queryClient, variables.pageId);
    },
  });
}
export type DeletePageAccessInput = Parameters<
  NonNullable<ReturnType<typeof defineDeletePageAccessMutation>["mutationFn"]>
>[0];
export type DeletePageAccessResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineDeletePageAccessMutation>["mutationFn"]>>
>;
export function deletePageAccess(
  context: ClientOperationContext,
  input: DeletePageAccessInput,
): Promise<DeletePageAccessResult> {
  return runClientMutation(context, input, defineDeletePageAccessMutation);
}

function defineSetPagePublishedMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: async ({ isPublished, pageId }: SetPagePublishedInput) => {
      if (isPublished) {
        const result = await apiFetch<{ access: unknown }>(`/pages/${pageId}/access`, {
          method: "PUT",
          body: JSON.stringify({
            accessLevel: "view",
            targetId: "*",
            targetType: "public",
          }),
        });

        return result.access;
      }

      return apiFetch<{ access: unknown }>(`/pages/${pageId}/access/public`, {
        method: "DELETE",
      });
    },
    onSuccess: async (_access, variables) => {
      await invalidatePageAccess(queryClient, variables.pageId);
    },
  });
}
export type SetPagePublishedResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineSetPagePublishedMutation>["mutationFn"]>>
>;
export function setPagePublished(
  context: ClientOperationContext,
  input: SetPagePublishedInput,
): Promise<SetPagePublishedResult> {
  return runClientMutation(context, input, defineSetPagePublishedMutation);
}

async function invalidatePageAccess(queryClient: QueryClient, pageId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: pageAccessQueryKey(pageId) }),
    queryClient.invalidateQueries({ queryKey: pageQueryKey(pageId) }),
  ]);
}

export async function switchPageWorkspace(
  queryClient: QueryClient,
  setActiveWorkspace: (workspaceId: string) => Promise<unknown>,
  workspaceId: string | null | undefined,
  pageId: string,
) {
  if (!workspaceId) return;
  await setActiveWorkspace(workspaceId);
  await queryClient.invalidateQueries({ queryKey: pageQueryKey(pageId) });
}

function defineInvitePageGuestMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: (input: { accessLevel: AccessLevel; email: string; pageId: string }) =>
      apiFetch<{ invitation?: unknown; request?: unknown }>(
        `/pages/${encodeURIComponent(input.pageId)}/guest-invitations`,
        {
          body: JSON.stringify({
            accessLevel: input.accessLevel,
            email: input.email,
          }),
          method: "POST",
        },
      ),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: pageGuestInvitationsQueryKey(input.pageId),
        }),
        queryClient.invalidateQueries({
          queryKey: pageGuestRequestsQueryKey(input.pageId),
        }),
      ]);
    },
  });
}
export type InvitePageGuestInput = Parameters<
  NonNullable<ReturnType<typeof defineInvitePageGuestMutation>["mutationFn"]>
>[0];
export type InvitePageGuestResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineInvitePageGuestMutation>["mutationFn"]>>
>;
export function invitePageGuest(
  context: ClientOperationContext,
  input: InvitePageGuestInput,
): Promise<InvitePageGuestResult> {
  return runClientMutation(context, input, defineInvitePageGuestMutation);
}

function defineCancelPageGuestInvitationMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: (input: { invitationId: string; pageId: string }) =>
      apiFetch<{ invitation: unknown }>(
        `/pages/${encodeURIComponent(input.pageId)}/guest-invitations/${encodeURIComponent(input.invitationId)}`,
        { method: "DELETE" },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: pageGuestInvitationsQueryKey(input.pageId),
      });
    },
  });
}
export type CancelPageGuestInvitationInput = Parameters<
  NonNullable<ReturnType<typeof defineCancelPageGuestInvitationMutation>["mutationFn"]>
>[0];
export type CancelPageGuestInvitationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineCancelPageGuestInvitationMutation>["mutationFn"]>>
>;
export function cancelPageGuestInvitation(
  context: ClientOperationContext,
  input: CancelPageGuestInvitationInput,
): Promise<CancelPageGuestInvitationResult> {
  return runClientMutation(context, input, defineCancelPageGuestInvitationMutation);
}

function defineAcceptPageGuestInvitationMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: (invitationId: string) =>
      apiFetch<{ pageId: string }>(
        `/page-guest-invitations/${encodeURIComponent(invitationId)}/accept`,
        { method: "POST" },
      ),
    onSuccess: async (result, invitationId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pageQueryKey(result.pageId) }),
        queryClient.invalidateQueries({
          queryKey: pageGuestInvitationQueryKey(invitationId),
        }),
      ]);
    },
  });
}
export type AcceptPageGuestInvitationInput = Parameters<
  NonNullable<ReturnType<typeof defineAcceptPageGuestInvitationMutation>["mutationFn"]>
>[0];
export type AcceptPageGuestInvitationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineAcceptPageGuestInvitationMutation>["mutationFn"]>>
>;
export function acceptPageGuestInvitation(
  context: ClientOperationContext,
  input: AcceptPageGuestInvitationInput,
): Promise<AcceptPageGuestInvitationResult> {
  return runClientMutation(context, input, defineAcceptPageGuestInvitationMutation);
}

function defineRevokePageGuestMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: (input: { pageId: string; userId: string }) =>
      apiFetch<{ access: unknown }>(
        `/pages/${encodeURIComponent(input.pageId)}/guests/${encodeURIComponent(input.userId)}`,
        { method: "DELETE" },
      ),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pageAccessQueryKey(input.pageId) }),
        queryClient.invalidateQueries({
          queryKey: pagePersonAccessTargetsQueryKey(input.pageId),
        }),
        queryClient.invalidateQueries({ queryKey: pageQueryKey(input.pageId) }),
      ]);
    },
  });
}
export type RevokePageGuestInput = Parameters<
  NonNullable<ReturnType<typeof defineRevokePageGuestMutation>["mutationFn"]>
>[0];
export type RevokePageGuestResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineRevokePageGuestMutation>["mutationFn"]>>
>;
export function revokePageGuest(
  context: ClientOperationContext,
  input: RevokePageGuestInput,
): Promise<RevokePageGuestResult> {
  return runClientMutation(context, input, defineRevokePageGuestMutation);
}
