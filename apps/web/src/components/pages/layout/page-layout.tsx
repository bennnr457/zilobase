import type { ReactNode } from "react";
import { useOptionalPageDesignSidebar } from "../design/page-design-sidebar";

import {
  MainPaneHeaderLeadingControl,
  PageHeader,
  type PageHeaderProps,
} from "../header/page-header";
import { ScrollViewport } from "@/components/ui/scroll-viewport";
import { usePromotedFullPagePath } from "@/components/pages/presentation/page-presentation";
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
  const promotedPath = usePromotedFullPagePath();
  const pathname = databaseId
    ? `/d/${encodeURIComponent(databaseId)}`
    : `/p/${encodeURIComponent(pageId ?? "")}`;
  // Promotion changes chrome without moving or remounting the live editor.
  const effectivePlacement = placement === "pane" && promotedPath === pathname ? "main" : placement;
  const overlaySidebar = placement !== "main";
  const hasSidebar = overlaySidebar
    ? Boolean(pageId && sidebar?.hasOverlaySidebar(pageId))
    : sidebar?.hasSidebar;

  return (
    <section
      className={cn("flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden", className)}
      data-page-layout={effectivePlacement}
    >
      {isEmbeddedMobileViewer() ? null : (
        <PageHeader
          databaseId={databaseId}
          leadingControl={
            effectivePlacement === "main" ? <MainPaneHeaderLeadingControl /> : undefined
          }
          onClose={effectivePlacement === "main" ? undefined : onClose}
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
          placement={effectivePlacement}
          rowNavigationDatabaseId={rowNavigationDatabaseId}
          showBreadcrumb={effectivePlacement === "main"}
          {...header}
        />
      )}
      <ScrollViewport
        className="min-h-0 flex-1"
        edgeFadeClassName={placement === "dialog" ? "hidden" : undefined}
      >
        {children}
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
