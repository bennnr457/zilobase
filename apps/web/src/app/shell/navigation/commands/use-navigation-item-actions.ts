import { getNavigationItemPath } from "../model/database-view-navigation";
import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import { toast } from "sonner";

import { useItemActionController } from "@zilobase/features/pages/react";
import { getNavigationPendingState } from "../model/navigation-item-state";
import { useLayoutEditor } from "@/features/pages/layout";

export function useNavigationItemActions({
  databaseId,
  pageId,
  meetingId,
}: {
  databaseId?: string | null;
  pageId?: string | null;
  meetingId?: string | null;
}) {
  const navigate = useNavigate();
  const { openLayoutEditor } = useLayoutEditor();
  const [isOpen, setIsOpen] = React.useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = React.useState(false);
  const actions = useItemActionController({ databaseId, pageId, meetingId });
  const {
    actionPageId,
    workspaceId,
    page,
    databasePayload,
    isDatabasePage,
    hasPageActions,
    isFavorite,
    displayName,
    lockLabel,
    locked,
    canToggleLock,
    effectiveFullWidth,
    createPage,
    deletePage,
    deleteDatabase,
    updateDatabase,
    updatePage,
    setFavorite,
    setDatabaseFavorite,
    updateUserSettings,
  } = actions;

  const { fullWidthUpdatePending, isDeleting, lockUpdatePending, favoriteDisabled } =
    getNavigationPendingState(
      {
        isDatabase: isDatabasePage,
        hasDatabase: Boolean(databasePayload),
        hasPage: Boolean(page),
        hasPageId: Boolean(pageId),
      },
      {
        userSettings: updateUserSettings.isPending,
        pageUpdate: updatePage.isPending,
        databaseUpdate: updateDatabase.isPending,
        pageDelete: deletePage.isPending,
        databaseDelete: deleteDatabase.isPending,
        pageFavorite: setFavorite.isPending,
        databaseFavorite: setDatabaseFavorite.isPending,
      },
    );
  const toggleLock = () =>
    actions.toggleLock({
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : `Could not update ${lockLabel.toLowerCase()}.`,
        ),
    });
  const toggleFavorite = () =>
    actions.toggleFavorite({
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Could not update favorite."),
    });
  const copyLink = async () => {
    if (!pageId && !databaseId) {
      return;
    }

    await navigator.clipboard.writeText(
      `${window.location.origin}${getNavigationItemPath({ databaseId, pageId })}`,
    );
    setIsOpen(false);
    toast.success(`${databaseId ? "Database" : "Page"} link copied.`);
  };
  const duplicatePage = async () => {
    try {
      const duplicate = await actions.duplicatePage();
      if (!duplicate) return;

      setIsOpen(false);
      toast.success("Page duplicated.");
      await navigate({
        to: "/p/$pageId",
        params: { pageId: duplicate.id },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not duplicate page.");
    }
  };
  const moveToTrash = () =>
    actions.moveToTrash({
      onSuccess: () => {
        setTrashConfirmOpen(false);
        setIsOpen(false);
        toast.success("Moved to trash.");
        void navigate({ to: "/" });
      },
      onError: (error) =>
        toast.error(
          error instanceof Error
            ? error.message
            : databaseId
              ? "Could not delete database."
              : "Could not delete page.",
        ),
    });
  const runMoreAction = (label: string) => {
    if (label === "Customize layout") {
      setIsOpen(false);
      openLayoutEditor({ databaseId, pageId });
      return;
    }
    if (label === "Copy Link") {
      void copyLink();
      return;
    }

    if (label === "Duplicate") {
      void duplicatePage();
      return;
    }

    if (label === "Move to Trash") {
      setTrashConfirmOpen(true);
    }
  };
  const togglePageFullWidth = () =>
    actions.togglePageFullWidth({
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not update full width setting.",
        ),
    });

  return {
    item: {
      pageId: actionPageId,
      workspaceId,
      displayName,
      isDatabase: isDatabasePage,
      hasActions: hasPageActions,
    },
    favorite: {
      active: isFavorite,
      disabled: favoriteDisabled,
      toggle: toggleFavorite,
    },
    lock: {
      canToggle: canToggleLock,
      pending: lockUpdatePending,
      active: locked,
      label: lockLabel,
      toggle: toggleLock,
    },
    layout: {
      pending: fullWidthUpdatePending,
      fullWidth: effectiveFullWidth,
      toggle: togglePageFullWidth,
    },
    moreMenu: {
      open: isOpen,
      setOpen: setIsOpen,
      run: runMoreAction,
      isDisabled: (label: string) => {
        switch (label) {
          case "Copy Link":
            return !pageId && !databaseId;
          case "Duplicate":
            return isDatabasePage || !page || createPage.isPending;
          case "Move to Trash":
            return (!actionPageId && !databaseId) || isDeleting;
          default:
            return false;
        }
      },
    },
    trash: {
      open: trashConfirmOpen,
      setOpen: setTrashConfirmOpen,
      pending: isDeleting,
      confirm: moveToTrash,
    },
  };
}
