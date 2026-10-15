import { Effect } from "effect";
import { isMobileViewport } from "@/lib/hooks/use-mobile";
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
    openPageInMainPane,
    openSidePane,
    sidePanePageId,
  } = usePageSidePane();

  const openPage = useCallback(
    (pageId: string, options?: OpenPageSidePaneOptions) =>
      Effect.runSync(
        Effect.gen(function* () {
          if (isMobileViewport()) {
            yield* Effect.sync(() =>
              openPageInMainPane(pageId, { databaseId: options?.databaseId ?? databaseId }),
            );
            return;
          }
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
              yield* Effect.sync(closeEmbeddedPageDialog);
            } else {
              yield* Effect.sync(closeSidePane);
            }
            return;
          }

          yield* Effect.sync(() => markPageNavigationStart(pageId));

          if (usesDialog) {
            yield* Effect.sync(() =>
              openEmbeddedPageDialog(pageId, { databaseId: options?.databaseId ?? databaseId }),
            );
            return;
          }

          yield* Effect.sync(() =>
            openSidePane(pageId, { databaseId: options?.databaseId ?? databaseId }),
          );
        }),
      ),
    [
      closeEmbeddedPageDialog,
      closeSidePane,
      contextPageId,
      databaseId,
      dialogPageId,
      openEmbeddedPageDialog,
      openPageInMainPane,
      openSidePane,
      queryClient,
      sidePanePageId,
      page,
    ],
  );

  return { openPage };
}
