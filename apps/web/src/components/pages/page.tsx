import { PageWorkspaceGate } from "@/components/workspaces";
import { PageSidePaneLayout, usePageSidePane } from "./pane/page-side-pane";
import { usePage } from "@zilobase/features/pages/react";
import { useOpenEmbeddedPage } from "./pane/use-open-embedded-page";
import { PageEditorPane } from "./pane/page-editor-pane";

import { useParams, useRouteContext, useSearch } from "@tanstack/react-router";
import { AuthenticatedRouteError } from "@/app/routing/route-shell";
import { FallbackErrorBoundary } from "@/components/desktop/diagnostics/fallback-error-boundary";
import { PublicPage, GuestPage } from "./publication/shared-page";
import { PageLayout } from "./pane/page-layout";

export default function Page() {
  const { pageId } = useParams({ from: "/p/$pageId" });
  const { publishedShare } = useRouteContext({ from: "/p/$pageId" });

  if (publishedShare === "public") {
    return <PublicPage />;
  }

  if (publishedShare === "guest") {
    return <GuestPage />;
  }

  return (
    <FallbackErrorBoundary
      fallback={<AuthenticatedRouteError resource="page" />}
      key={pageId}
      name="page.authenticated"
    >
      <AuthenticatedPage />
    </FallbackErrorBoundary>
  );
}

function AuthenticatedPage() {
  const { pageId } = useParams({ from: "/p/$pageId" });
  const { meeting: focusMeetingId } = useSearch({ from: "/p/$pageId" });
  const { data: page } = usePage(pageId, { refetchOnMount: false });
  const {
    closeSidePane,
    openSidePaneAsFullPage,
    renderedSidePanePageId,
    sidePaneAnimatedOpen,
    sidePaneContentReady,
    sidePaneDatabaseId,
  } = usePageSidePane();
  const { openPage } = useOpenEmbeddedPage({
    contextPageId: pageId,
    page,
  });

  return (
    <PageSidePaneLayout
      mainOwnsLayout
      main={
        <PageLayout pageId={pageId} placement="main">
          <PageWorkspaceGate pageId={pageId}>
            <PageEditorPane
              focusMeetingId={focusMeetingId}
              key={pageId}
              onOpenPage={openPage}
              pageId={pageId}
              showConnectionIndicator
            />
          </PageWorkspaceGate>
        </PageLayout>
      }
      sidePane={
        sidePaneContentReady && renderedSidePanePageId ? (
          <PageLayout
            pageId={renderedSidePanePageId}
            placement="pane"
            rowNavigationDatabaseId={sidePaneDatabaseId}
            onClose={closeSidePane}
            onOpenFullPage={openSidePaneAsFullPage}
          >
            <PageWorkspaceGate pageId={renderedSidePanePageId}>
              <PageEditorPane
                databaseId={sidePaneDatabaseId}
                enableComments={false}
                layoutPanelMode="overlay"
                key={renderedSidePanePageId}
                onOpenPage={openPage}
                pageId={renderedSidePanePageId}
              />
            </PageWorkspaceGate>
          </PageLayout>
        ) : null
      }
      sidePaneOpen={sidePaneAnimatedOpen}
      sidePaneVisible={renderedSidePanePageId !== null}
    />
  );
}
