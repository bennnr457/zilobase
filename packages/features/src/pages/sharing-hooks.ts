import type { AccessLevel, AccessTargetType, PageAccessRule } from "./contracts";
import { useMemo } from "react";
import { useSession } from "../auth/react";
import { useActiveWorkspaceId, useWorkspaceGuestPolicy } from "../workspaces/react";
import {
  usePage,
  usePageAccessLevel,
  usePageAccess,
  usePageAccessTargets,
  usePagePersonAccessTargets,
  usePageGuestInvitations,
  usePageGuestRequests,
} from "./query-hooks";
import { useDeletePageAccess, useSetPagePublished, useUpsertPageAccess } from "./sharing-mutations";
import {
  useInvitePageGuest,
  useCancelPageGuestInvitation,
  useRevokePageGuest,
} from "./sharing-mutations";
import { useDatabaseMetadata } from "../databases/queries/metadata";
import { useDatabaseAccess } from "../databases/access/react";
import {
  useDeleteDatabaseAccess,
  useSetDatabasePublished,
  useUpsertDatabaseAccess,
} from "../databases/access/react";
import {
  getGuestPageId,
  isSharingWorkspaceMember,
  getSharingAccessLevel,
  getSharingRules,
  getSharingRuleState,
  getPendingItems,
  getGuestActionLabel,
  getDatabaseSharingAccessLevel,
} from "./publication";

export function useItemSharingController({
  databaseId,
  pageId,
}: {
  databaseId?: string | null;
  pageId?: string | null;
}) {
  const workspaceId = useActiveWorkspaceId();
  const { data: session } = useSession();
  const { data: page } = usePage(pageId);
  const { data: accessLevel } = usePageAccessLevel(pageId);
  const { data: accessPayload } = usePageAccess(pageId);
  const { data: databasePayload } = useDatabaseMetadata(databaseId);
  const { data: databaseAccessPayload } = useDatabaseAccess(databaseId);
  const { data: targets } = usePageAccessTargets(workspaceId);
  const guestPageId = getGuestPageId(databaseId, pageId);
  const isWorkspaceMember = isSharingWorkspaceMember(targets, session);
  const { data: personTargets } = usePagePersonAccessTargets(pageId, {
    enabled: Boolean(guestPageId),
  });
  const { data: guestInvitations } = usePageGuestInvitations(databaseId ? null : pageId);
  const { data: guestRequests } = usePageGuestRequests(databaseId ? null : pageId);
  const { data: guestPolicy } = useWorkspaceGuestPolicy(workspaceId, {
    enabled: Boolean(guestPageId && isWorkspaceMember),
  });
  const upsertAccess = useUpsertPageAccess();
  const upsertDatabaseAccess = useUpsertDatabaseAccess();
  const deleteAccess = useDeletePageAccess();
  const deleteDatabaseAccess = useDeleteDatabaseAccess();
  const setPublished = useSetPagePublished();
  const setDatabasePublished = useSetDatabasePublished();
  const inviteGuest = useInvitePageGuest();
  const cancelGuestInvitation = useCancelPageGuestInvitation();
  const revokeGuest = useRevokePageGuest();
  const isDatabase = Boolean(databaseId);
  const effectiveAccessLevel = getSharingAccessLevel(isDatabase, databasePayload, accessLevel);
  const canManage = effectiveAccessLevel === "full";

  const shareableMembers = useMemo(
    () => (targets?.members ?? []).filter((member) => member.id !== session?.user?.id),
    [session?.user?.id, targets?.members],
  );
  const targetByKey = useMemo(() => {
    return new Map<string, { label: string; detail?: string }>([
      ...(targets?.members ?? []).map((member): [string, { label: string; detail: string }] => [
        `user:${member.id}`,
        {
          detail: member.email,
          label: member.name || member.email,
        },
      ]),
      ...(personTargets?.guests ?? []).map((guest): [string, { label: string; detail: string }] => [
        `user:${guest.id}`,
        {
          detail: `${guest.email} · Guest`,
          label: guest.name || guest.email,
        },
      ]),
    ]);
  }, [personTargets?.guests, targets?.members]);
  const guestUserIds = useMemo(
    () => new Set((personTargets?.guests ?? []).map((guest) => guest.id)),
    [personTargets?.guests],
  );
  const rules = getSharingRules(isDatabase, databaseAccessPayload, accessPayload);
  const { isPublished, sharingRules } = getSharingRuleState(rules);
  const pendingGuestInvitations = getPendingItems(guestInvitations);
  const pendingGuestRequests = getPendingItems(guestRequests);
  const guestActionLabel = getGuestActionLabel(guestPolicy);

  const shareItem = (
    targetValue: string,
    nextAccessLevel: AccessLevel,
    options: { onSuccess?: () => void; onError?: (error: Error) => void },
  ) => {
    if (!targetValue || (!page && !databaseId)) return;
    const [targetType, targetId] = targetValue.split(":") as [AccessTargetType, string];
    if (isDatabase) {
      upsertDatabaseAccess.mutate(
        {
          accessLevel: getDatabaseSharingAccessLevel(nextAccessLevel),
          targetId,
          targetType,
          databaseId: databaseId as string,
        },
        options,
      );
      return;
    }
    upsertAccess.mutate(
      { accessLevel: nextAccessLevel, targetId, targetType, pageId: page?.id as string },
      options,
    );
  };
  const invitePageGuest = (
    guestEmail: string,
    guestAccessLevel: AccessLevel,
    options: Parameters<typeof inviteGuest.mutate>[1],
  ) => {
    const email = guestEmail.trim().toLowerCase();
    if (!pageId || !email || !canManage || !isWorkspaceMember || inviteGuest.isPending) return;
    inviteGuest.mutate({ accessLevel: guestAccessLevel, email, pageId }, options);
  };
  const togglePublished = (
    checked: boolean,
    options: { onSuccess?: () => void; onError?: (error: Error) => void },
  ) => {
    const publishingPending = isDatabase ? setDatabasePublished.isPending : setPublished.isPending;
    if ((!page && !databaseId) || !canManage || publishingPending) return;
    if (isDatabase) {
      setDatabasePublished.mutate(
        { isPublished: checked, databaseId: databaseId as string },
        options,
      );
      return;
    }
    setPublished.mutate({ isPublished: checked, pageId: page?.id as string }, options);
  };
  const deleteRule = (
    rule: Pick<PageAccessRule, "id" | "targetId">,
    onError: (error: Error) => void,
    onGuestError: (error: Error) => void,
  ) =>
    isDatabase
      ? deleteDatabaseAccess.mutate(
          { ruleId: rule.id, databaseId: databaseId as string },
          { onError },
        )
      : guestUserIds.has(rule.targetId)
        ? revokeGuest.mutate(
            { pageId: pageId as string, userId: rule.targetId },
            { onError: onGuestError },
          )
        : deleteAccess.mutate({ ruleId: rule.id, pageId: pageId as string }, { onError });
  const cancelInvitation = (
    invitationId: string,
    options: Parameters<typeof cancelGuestInvitation.mutate>[1],
  ) => cancelGuestInvitation.mutate({ invitationId, pageId: pageId as string }, options);

  return {
    shareItem,
    invitePageGuest,
    togglePublished,
    deleteRule,
    cancelInvitation,
    page,
    session,
    isDatabase,
    effectiveAccessLevel,
    canManage,
    isWorkspaceMember,
    shareableMembers,
    targetByKey,
    guestUserIds,
    isPublished,
    sharingRules,
    pendingGuestInvitations,
    pendingGuestRequests,
    guestActionLabel,
    upsertAccess,
    upsertDatabaseAccess,
    deleteAccess,
    deleteDatabaseAccess,
    setPublished,
    setDatabasePublished,
    inviteGuest,
    cancelGuestInvitation,
    revokeGuest,
  };
}
