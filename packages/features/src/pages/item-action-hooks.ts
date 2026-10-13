import { useActiveWorkspaceId } from "../workspaces/hooks";
import { useCreatePage, useUpdatePage, useDeletePage } from "./content-mutations";
import { useSetPageFavorite } from "./activity-mutations";
import { usePage, usePageAccessLevel, usePageNavigation } from "./query-hooks";
import { getNavigationItemState } from "./navigation-item-state";
import {
  useDeleteDatabase,
  useSetDatabaseFavorite,
  useUpdateDatabase,
} from "../databases/mutations/databases";
import { useDatabaseMetadata } from "../databases/queries/metadata";
import { useUpdateUserSettings, useUserSettings } from "../user-settings/hooks";
import { getPrimaryPageParentId, resolvePageFullWidth } from "./queries";
import { buildPageDuplicateInput } from "./duplication";

type ActionCallbacks = { onSuccess?: () => void; onError?: (error: Error) => void };
export function useItemActionController({
  databaseId,
  pageId,
  meetingId,
}: {
  databaseId?: string | null;
  pageId?: string | null;
  meetingId?: string | null;
}) {
  const { data: databasePayload } = useDatabaseMetadata(databaseId, {
    includeDeleted: true,
  });
  const workspaceId = useActiveWorkspaceId();
  const actionPageId = pageId ?? databasePayload?.database.pageId;
  const { data: page } = usePage(actionPageId, {
    refetchOnMount: false,
  });
  const { data: navigation } = usePageNavigation(workspaceId);
  const pages = navigation?.pages ?? [];
  const createPage = useCreatePage();
  const deletePage = useDeletePage();
  const deleteDatabase = useDeleteDatabase();
  const updateDatabase = useUpdateDatabase();
  const updatePage = useUpdatePage();
  const setFavorite = useSetPageFavorite();
  const setDatabaseFavorite = useSetDatabaseFavorite();
  const { data: userSettings } = useUserSettings();
  const updateUserSettings = useUpdateUserSettings();

  const listPage = pages.find((item) => item.id === actionPageId);
  const isDatabasePage = Boolean(databaseId);
  const isMeetingPage = Boolean(meetingId);
  const hasPageActions = Boolean(actionPageId || databaseId);

  const { data: pageAccessLevel } = usePageAccessLevel(actionPageId, {
    refetchOnMount: false,
  });
  const itemState = getNavigationItemState({
    databaseId,
    meetingId,
    page,
    listedPage: listPage,
    database: databasePayload?.database,
    pageAccessLevel,
  });
  const { isFavorite, locked, canToggleLock } = itemState;
  const effectiveFullWidth = resolvePageFullWidth(page, userSettings?.pageFullWidth);

  const toggleLock = (options: ActionCallbacks) => {
    const pending = isDatabasePage ? updateDatabase.isPending : updatePage.isPending;
    if (pending || !canToggleLock) return;
    if (isDatabasePage) {
      if (!databaseId || !databasePayload) return;
      updateDatabase.mutate(
        { databaseId, configuration: [{ operation: "set", path: ["locked"], value: !locked }] },
        options,
      );
      return;
    }
    if (!page) return;
    updatePage.mutate(
      { id: page.id, metadata: isMeetingPage ? { meetingLocked: !locked } : { locked: !locked } },
      options,
    );
  };
  const toggleFavorite = (options: ActionCallbacks) => {
    if (databaseId) {
      if (setDatabaseFavorite.isPending) return;
      setDatabaseFavorite.mutate({ databaseId, isFavorite: !isFavorite }, options);
      return;
    }
    if (!pageId || setFavorite.isPending) return;
    setFavorite.mutate({ isFavorite: !isFavorite, pageId }, options);
  };
  const duplicatePage = async () => {
    if (!page || createPage.isPending) return;
    return createPage.mutateAsync(
      buildPageDuplicateInput(
        page,
        pageId
          ? (getPrimaryPageParentId(navigation?.placements ?? [], pageId) ?? undefined)
          : undefined,
      ),
    );
  };
  const moveToTrash = (options: ActionCallbacks) => {
    if (isDatabasePage) {
      if (!databaseId || deleteDatabase.isPending) return;
      deleteDatabase.mutate(databaseId, options);
      return;
    }
    if (!actionPageId || deletePage.isPending) return;
    deletePage.mutate(actionPageId, options);
  };
  const togglePageFullWidth = (options: ActionCallbacks) => {
    if (isDatabasePage || updateUserSettings.isPending || updatePage.isPending) return;
    updateUserSettings.mutate({ pageFullWidth: !userSettings?.pageFullWidth }, options);
  };
  return {
    ...itemState,
    effectiveFullWidth,
    actionPageId,
    workspaceId,
    page,
    databasePayload,
    isDatabasePage,
    hasPageActions,
    createPage,
    deletePage,
    deleteDatabase,
    updateDatabase,
    updatePage,
    setFavorite,
    setDatabaseFavorite,
    updateUserSettings,
    toggleLock,
    toggleFavorite,
    duplicatePage,
    moveToTrash,
    togglePageFullWidth,
  };
}
