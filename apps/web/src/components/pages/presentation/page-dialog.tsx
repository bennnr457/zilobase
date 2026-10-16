import { useRef } from "react";
import { Effect } from "effect";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  usePageSidePane,
  getFullPagePath,
} from "@/components/pages/presentation/page-presentation";
import { PageWorkspaceGate } from "@/components/workspaces/access/page-workspace-gate";
import { useOptionalPageDesignSidebar } from "../design/page-design-sidebar";
import { PageLayout } from "../layout/page-layout";
import { PageContent } from "../editor/page-content";
import { useOpenEmbeddedPage } from "../navigation/page-navigation";
import { isMobileViewport, useIsMobile } from "@/lib/hooks/use-mobile";
import type { OpenPageOptions } from "../navigation/page-navigation";
import type { usePage } from "@zilobase/features/pages/react";

export function PageDialog({
  onOpenPage,
  contextPageId = null,
  databaseId,
  hostPage,
  readOnly = false,
}: {
  onOpenPage?: (pageId: string, options?: OpenPageOptions) => void;
  contextPageId?: string | null;
  databaseId?: string | null;
  hostPage?: ReturnType<typeof usePage>["data"];
  readOnly?: boolean;
}) {
  const { openPage } = useOpenEmbeddedPage({ contextPageId, databaseId, page: hostPage });
  const { closeEmbeddedPageDialog, dialogDatabaseId, dialogPageId } = usePageSidePane();
  const pageLayoutSidebar = useOptionalPageDesignSidebar();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const returnFocus = useRef<HTMLElement | null>(null);
  const closeDialogCommand = Effect.gen(function* () {
    if (pageLayoutSidebar?.overlayPageId === dialogPageId) {
      yield* Effect.sync(() => pageLayoutSidebar.closeOverlay());
    }
    yield* Effect.sync(closeEmbeddedPageDialog);
  });
  const closeDialog = () => Effect.runSync(closeDialogCommand);

  if (isMobile || isMobileViewport()) return null;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
      open={dialogPageId !== null}
    >
      <DialogContent
        className="flex h-[90dvh] max-h-[90dvh] min-h-0 w-full flex-col gap-0 overflow-hidden p-0 dark:bg-surface-navigation sm:h-[90vh] sm:max-h-[90vh] sm:max-w-4xl"
        data-page-dialog-panel
        onOpenAutoFocus={() => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus({ preventScroll: true });
          }
        }}
        hideMobileDragHandle
        showCloseButton={false}
        unstyledContent
      >
        <DialogTitle className="sr-only">Page preview</DialogTitle>
        <DialogDescription className="sr-only">Page preview</DialogDescription>
        {dialogPageId ? (
          <PageLayout
            pageId={dialogPageId}
            placement="dialog"
            rowNavigationDatabaseId={dialogDatabaseId}
            onClose={closeDialog}
            onOpenFullPage={() =>
              Effect.runSync(
                Effect.gen(function* () {
                  yield* closeDialogCommand;
                  yield* Effect.sync(() => {
                    void navigate({ to: getFullPagePath(dialogPageId) });
                  });
                }),
              )
            }
          >
            <PageWorkspaceGate pageId={dialogPageId}>
              <PageContent
                databaseId={dialogDatabaseId}
                key={dialogPageId}
                layoutPanelMode="overlay"
                onOpenPage={onOpenPage ?? openPage}
                pageId={dialogPageId}
                readOnly={readOnly}
              />
            </PageWorkspaceGate>
          </PageLayout>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
