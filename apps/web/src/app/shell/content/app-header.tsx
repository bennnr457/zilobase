import {
  getDatabaseId,
  MainPaneHeaderLeadingControl,
  PagePaneHeader,
  PageSidePaneCollapseButton,
} from "@/features/pages/pane/page-pane-header";
import { PageSidePaneHeaderCell } from "@/features/pages/pane/page-side-pane";
import { useOptionalPageLayoutSidebar } from "@/features/pages/layout/page-layout-sidebar";

type AppHeaderProps = {
  auxiliarySidePaneCloseLabel?: string;
  auxiliarySidePaneOpen?: boolean;
  auxiliarySidePanePageId?: string | null;
  discussionsOpen: boolean;
  isSettingsPage: boolean;
  onToggleDiscussions?: () => void;
  onTogglePageSidebar?: () => void;
  pageSidebarOpen?: boolean;
  onCloseAuxiliarySidePane?: () => void;
  onCloseSidePane: () => void;
  pathname: string;
  renderedSidePaneDatabaseId: string | null;
  renderedSidePanePageId: string | null;
  sidePaneAnimatedOpen: boolean;
  sidePaneDatabaseId: string | null;
};

export function AppHeader(props: AppHeaderProps) {
  const showItemSidePaneHeader = Boolean(
    props.renderedSidePanePageId || props.renderedSidePaneDatabaseId,
  );
  const sideOpen = props.auxiliarySidePaneOpen || showItemSidePaneHeader;
  const splitActive = Boolean(sideOpen && props.sidePaneAnimatedOpen);
  return (
    <>
      <PageSidePaneHeaderCell className="z-10" side="main" splitActive={splitActive}>
        <PagePaneHeader
          className="min-w-0 flex-1"
          discussionsOpen={props.discussionsOpen}
          leadingControl={<MainPaneHeaderLeadingControl />}
          onToggleDiscussions={props.onToggleDiscussions}
          onTogglePageSidebar={props.onTogglePageSidebar}
          pageSidebarOpen={props.pageSidebarOpen}
          pathname={props.pathname}
          showActions={!props.isSettingsPage}
        />
      </PageSidePaneHeaderCell>
      {sideOpen ? (
        <PageSidePaneHeaderCell side="side" splitActive={splitActive}>
          <SideHeader props={props} showItemSidePaneHeader={showItemSidePaneHeader} />
        </PageSidePaneHeaderCell>
      ) : null}
    </>
  );
}

function SideHeader({
  props,
  showItemSidePaneHeader,
}: {
  props: AppHeaderProps;
  showItemSidePaneHeader: boolean;
}) {
  if (showItemSidePaneHeader || props.auxiliarySidePanePageId) return <ItemSideHeader {...props} />;
  if (!props.onCloseAuxiliarySidePane) return null;
  return (
    <div className="flex h-full w-full items-center px-3">
      <PageSidePaneCollapseButton
        label={props.auxiliarySidePaneCloseLabel ?? "Close AI settings"}
        onClick={props.onCloseAuxiliarySidePane}
      />
      <div id="agent-settings-header-actions" className="ml-auto" />
    </div>
  );
}

function ItemSideHeader(
  props: Pick<
    AppHeaderProps,
    | "renderedSidePanePageId"
    | "renderedSidePaneDatabaseId"
    | "auxiliarySidePanePageId"
    | "onCloseAuxiliarySidePane"
    | "onCloseSidePane"
    | "sidePaneDatabaseId"
    | "pathname"
  >,
) {
  const sidebar = useOptionalPageLayoutSidebar();
  const pageId = props.renderedSidePanePageId;
  const sidePath = itemSidePath(props.renderedSidePaneDatabaseId, pageId);
  return (
    <PagePaneHeader
      className="min-w-0 flex-1"
      onClose={
        props.auxiliarySidePanePageId ? props.onCloseAuxiliarySidePane : props.onCloseSidePane
      }
      onTogglePageSidebar={
        pageId && sidebar?.hasOverlaySidebar(pageId)
          ? () => sidebar.toggleOverlay(pageId)
          : undefined
      }
      pageSidebarOpen={sidebar?.overlayPageId === pageId}
      pathname={
        props.auxiliarySidePanePageId
          ? `/p/${encodeURIComponent(props.auxiliarySidePanePageId)}`
          : sidePath
      }
      rowNavigationDatabaseId={
        pageId ? (props.sidePaneDatabaseId ?? getDatabaseId(props.pathname)) : null
      }
      showBreadcrumb={false}
    />
  );
}

function itemSidePath(databaseId: string | null, pageId: string | null) {
  return databaseId
    ? `/d/${encodeURIComponent(databaseId)}`
    : `/p/${encodeURIComponent(pageId ?? "")}`;
}
