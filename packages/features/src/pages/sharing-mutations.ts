import type { QueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import {
  pageQueryKey,
  pageAccessQueryKey,
  pagePersonAccessTargetsQueryKey,
  pageGuestInvitationQueryKey,
  pageGuestInvitationsQueryKey,
  pageGuestRequestsQueryKey,
} from "./queries";
import type { AccessLevel, AccessTargetType } from "./contracts";
type UpsertPageAccessInput = {
  accessLevel: AccessLevel;
  targetId: string;
  targetType: AccessTargetType;
  pageId: string;
};

type SetPagePublishedInput = {
  isPublished: boolean;
  pageId: string;
};

export function useUpsertPageAccess() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
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

export function useDeletePageAccess() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({ ruleId, pageId }: { ruleId: string; pageId: string }) =>
      apiFetch<{ access: unknown }>(`/pages/${pageId}/access/${ruleId}`, {
        method: "DELETE",
      }),
    onSuccess: async (_access, variables) => {
      await invalidatePageAccess(queryClient, variables.pageId);
    },
  });
}

export function useSetPagePublished() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
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

export function useInvitePageGuest() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
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

export function useCancelPageGuestInvitation() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
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

export function useAcceptPageGuestInvitation() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
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

export function useRevokePageGuest() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
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
