import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  PageCommentsViewContext,
  useOptionalPageEditorComments,
  usePageCommentController,
} from "../../editor/comments/components/comments-context";
import { useOptionalPageDesignSidebar } from "../../design/components/page-design-sidebar";

import {
  MainPaneHeaderLeadingControl,
  PageHeader,
  type PageHeaderProps,
} from "../../header/components/page-header";
import { ScrollViewport } from "@/components/ui/scroll-viewport";
import { cn } from "@/lib/utils";

type PagePlacement =
  | { placement: "main"; onClose?: never; onOpenFullPage?: never }
  | {
      placement: "pane" | "dialog";
      onClose: () => void;
      onOpenFullPage: () => void;
    };

export type PageLayoutProps = PagePlacement & {
  pageId: string | null;
  databaseId?: string | null;
  rowNavigationDatabaseId?: string | null;
  children: ReactNode;
  className?: string;
  header?: Partial<
    Pick<
      PageHeaderProps,
      | "actions"
      | "className"
      | "discussionsOpen"
      | "leadingControl"
      | "onToggleDiscussions"
      | "onTogglePageSidebar"
      | "pageSidebarOpen"
      | "showActions"
      | "showBreadcrumb"
    >
  >;
};

/** The same page frame is mounted in a route, resizable pane, or modal host. */
export function PageLayout({
  children,
  className,
  databaseId = null,
  header,
  onClose,
  onOpenFullPage,
  pageId,
  placement,
  rowNavigationDatabaseId,
}: PageLayoutProps) {
  const sidebar = useOptionalPageDesignSidebar();
  const pathname = databaseId
    ? `/d/${encodeURIComponent(databaseId)}`
    : `/p/${encodeURIComponent(pageId ?? "")}`;
  const overlaySidebar = placement !== "main";
  const hasSidebar = overlaySidebar
    ? Boolean(pageId && sidebar?.hasOverlaySidebar(pageId))
    : sidebar?.hasSidebar;

  const controller = usePageCommentController(databaseId ? null : pageId);
  const editorComments = useOptionalPageEditorComments();
  const [commentsPageId, setCommentsPageId] = useState<string | null>(null);
  const commentsOpen = Boolean(controller && pageId && commentsPageId === pageId);
  const frameRef = useRef<HTMLElement>(null);
  const openComments = useCallback(() => setCommentsPageId(pageId), [pageId]);
  const closeComments = useCallback(() => {
    setCommentsPageId(null);
    controller?.activateThread(null, { openSidebar: false });
    frameRef.current?.querySelector<HTMLButtonElement>('[aria-label="Close comments"]')?.focus();
  }, [controller]);

  useEffect(() => {
    if (!controller) return;
    controller.setOpenThreadHandler(openComments);
    return () => controller.setOpenThreadHandler(null);
  }, [controller, openComments]);

  const request = editorComments?.editorCommentsOpenRequest;
  const lastRequest = useRef(request);
  useEffect(() => {
    if (request === lastRequest.current) return;
    lastRequest.current = request;
    if (request?.pageId === pageId) openComments();
  }, [request, pageId, openComments]);

  return (
    <section
      className={cn("flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden", className)}
      data-page-layout={placement}
      ref={frameRef}
      onClick={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        const anchor = target?.closest<HTMLElement>("[data-comment-id]");
        if (
          anchor &&
          anchor.closest("[data-page-layout]") === frameRef.current &&
          anchor.dataset.commentId &&
          anchor.dataset.commentResolved !== "true"
        ) {
          controller?.activateThread(anchor.dataset.commentId);
        }
      }}
    >
      {isEmbeddedMobileViewer() ? null : (
        <PageHeader
          databaseId={databaseId}
          discussionsOpen={commentsOpen}
          onToggleDiscussions={
            controller ? () => (commentsOpen ? closeComments() : openComments()) : undefined
          }
          leadingControl={placement === "main" ? <MainPaneHeaderLeadingControl /> : undefined}
          onClose={placement === "main" ? undefined : onClose}
          onOpenFullPage={onOpenFullPage}
          onTogglePageSidebar={
            hasSidebar
              ? () => {
                  if (overlaySidebar && pageId) sidebar?.toggleOverlay(pageId);
                  else sidebar?.setOpen(!sidebar.open);
                }
              : undefined
          }
          pageId={pageId}
          pageSidebarOpen={overlaySidebar ? sidebar?.overlayPageId === pageId : sidebar?.open}
          pathname={pathname}
          placement={placement}
          rowNavigationDatabaseId={rowNavigationDatabaseId}
          showBreadcrumb={placement === "main"}
          {...header}
        />
      )}
      <ScrollViewport
        className="min-h-0 flex-1"
        edgeFadeClassName={placement === "dialog" ? "hidden" : undefined}
      >
        <PageCommentsViewContext.Provider
          value={{ pageId, open: commentsOpen, onClose: closeComments }}
        >
          {children}
        </PageCommentsViewContext.Provider>
      </ScrollViewport>
    </section>
  );
}

export function isEmbeddedMobileViewer() {
  if (typeof window === "undefined") {
    return false;
  }

  const search = new URLSearchParams(window.location.search);

  return search.get("mobileViewer") === "1";
}
