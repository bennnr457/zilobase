import { useCallback } from "react";
import { markPageNavigationStart } from "../navigation/page-navigation-timing";

import { usePageSidePane } from "./page-side-pane";
import type { OpenPageSidePaneOptions } from "./page-side-pane";
import { useZilobaseFeatures } from "@zilobase/features";
import { resolveEmbeddedItemsOpenAsFromCache, type Page } from "@zilobase/features/pages";
import { readPublishedEmbeddedItemsOpenAs } from "../publication/published-page-preferences";

export function useOpenEmbeddedPage({
  contextPageId,
  databaseId,
  page,
}: {
  contextPageId: string | null;
  databaseId?: string | null;
  page: Page | null | undefined;
}) {
  const { queryClient } = useZilobaseFeatures();
  const {
    closeEmbeddedPageDialog,
    closeSidePane,
    dialogPageId,
    openEmbeddedPageDialog,
    openSidePane,
    sidePanePageId,
  } = usePageSidePane();

  const openPage = useCallback(
    (pageId: string, options?: OpenPageSidePaneOptions) => {
      const mode = resolveEmbeddedItemsOpenAsFromCache(
        queryClient,
        contextPageId,
        page,
        readPublishedEmbeddedItemsOpenAs,
      );
      const usesDialog = mode === "dialog";
      const activePageId = usesDialog ? dialogPageId : sidePanePageId;
      const isCurrentlyOpen = activePageId === pageId;

      if (pageId === contextPageId || isCurrentlyOpen) {
        if (usesDialog) {
          closeEmbeddedPageDialog();
        } else {
          closeSidePane();
        }
        return;
      }

      markPageNavigationStart(pageId);

      if (usesDialog) {
        openEmbeddedPageDialog(pageId, {
          databaseId: options?.databaseId ?? databaseId,
        });
        return;
      }

      openSidePane(pageId, {
        databaseId: options?.databaseId ?? databaseId,
      });
    },
    [
      closeEmbeddedPageDialog,
      closeSidePane,
      contextPageId,
      databaseId,
      dialogPageId,
      openEmbeddedPageDialog,
      openSidePane,
      queryClient,
      sidePanePageId,
      page,
    ],
  );

  return { openPage };
}
