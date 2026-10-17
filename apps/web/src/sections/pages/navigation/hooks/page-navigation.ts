import { Effect } from "effect";
import { isMobileViewport } from "@/hooks/use-mobile";
import { useCallback } from "react";
import { markPageNavigationStart } from "../lib/page-navigation-timing";

import { usePageSidePane } from "@/sections/pages/presentation/components/page-presentation";
import type { OpenPageSidePaneOptions } from "@/sections/pages/presentation/components/page-presentation";
import { useZilobaseFeatures } from "@zilobase/features";
import { resolveEmbeddedItemsOpenAsFromCache, type Page } from "@zilobase/features/pages";
import { readPublishedEmbeddedItemsOpenAs } from "../../access/lib/public-page-opening-preferences";

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
    (pageId: string, options?: OpenPageOptions) =>
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
          const usesDialog = options?.presentation === "dialog" || mode === "dialog";
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
              openEmbeddedPageDialog(pageId, {
                databaseId: options?.databaseId ?? databaseId,
                focusTitle: options?.focusTitle,
              }),
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

export type OpenPageOptions = OpenPageSidePaneOptions & { presentation?: "dialog" };
