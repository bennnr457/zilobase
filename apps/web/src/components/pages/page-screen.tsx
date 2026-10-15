import { PageWorkspaceGate } from "@/components/workspaces/index";
import { PageSidePaneLayout } from "@/components/pages/presentation/page-side-pane";
import { usePageSidePane } from "@/components/pages/presentation/page-presentation";
import { usePage } from "@zilobase/features/pages/react";
import { useOpenEmbeddedPage } from "./navigation/page-navigation";
import { PageContent } from "./content/page-content";

import { useParams, useRouteContext, useSearch } from "@tanstack/react-router";
import { AuthenticatedRouteError } from "@/app/routing/route-shell";
import { FallbackErrorBoundary } from "@/components/desktop/diagnostics/fallback-error-boundary";
import { PublicPage, GuestPage } from "./access/public-and-guest-page-screen";
import { PageLayout } from "./layout/page-layout";

export default function PageScreen() {
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
            <PageContent
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
              <PageContent
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
