import { LayoutEditorProvider } from "../layout";
import { useParams } from "@tanstack/react-router";
import { PageSidePaneLayout, PageSidePaneProvider, usePageSidePane } from "../pane/page-side-pane";
import { usePage } from "@zilobase/features/pages/react";
import { EmbeddedPageDialog } from "../pane/embedded-page-dialog";
import { useOpenEmbeddedPage } from "../pane/use-open-embedded-page";
import {
  GuestPageTitle,
  GuestPageActions,
  PublicPageBreadcrumb,
  PublicLoginButton,
} from "./shared-page-header";
import { PageLayout } from "../pane/page-layout";
import { PageEditorPane } from "../pane/page-editor-pane";

export function PublicPage() {
  const { pageId } = useParams({ from: "/p/$pageId" });

  return (
    <PageSidePaneProvider resetKey={pageId}>
      <LayoutEditorProvider>
        <PublicPageContent pageId={pageId} />
      </LayoutEditorProvider>
    </PageSidePaneProvider>
  );
}

export function GuestPage() {
  const { pageId } = useParams({ from: "/p/$pageId" });

  return (
    <PageSidePaneProvider resetKey={pageId}>
      <LayoutEditorProvider>
        <PublicPageContent guest pageId={pageId} />
      </LayoutEditorProvider>
    </PageSidePaneProvider>
  );
}

function PublicPageContent({ guest = false, pageId }: { guest?: boolean; pageId: string }) {
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
    <>
      <PageSidePaneLayout
        className="bg-surface-canvas"
        standalone
        mainOwnsLayout
        viewportHeightClass="h-svh"
        main={
          <PageLayout
            pageId={pageId}
            placement="main"
            header={{
              leadingControl: guest ? (
                <GuestPageTitle pageId={pageId} />
              ) : (
                <PublicPageBreadcrumb pageId={pageId} />
              ),
              actions: guest ? <GuestPageActions /> : <PublicLoginButton />,
              showBreadcrumb: false,
              className: "border-b",
            }}
          >
            <PageEditorPane key={pageId} onOpenPage={openPage} readOnly={!guest} pageId={pageId} />
          </PageLayout>
        }
        sidePane={
          renderedSidePanePageId ? (
            <PageLayout
              pageId={renderedSidePanePageId}
              placement="pane"
              onClose={closeSidePane}
              onOpenFullPage={openSidePaneAsFullPage}
              header={{ leadingControl: null, showActions: false }}
            >
              {sidePaneContentReady ? (
                <PageEditorPane
                  databaseId={sidePaneDatabaseId}
                  enableComments={false}
                  key={renderedSidePanePageId}
                  onOpenPage={openPage}
                  readOnly={!guest}
                  pageId={renderedSidePanePageId}
                />
              ) : null}
            </PageLayout>
          ) : null
        }
        sidePaneOpen={sidePaneAnimatedOpen}
        sidePaneVisible={renderedSidePanePageId !== null}
      />
      <EmbeddedPageDialog onOpenPage={openPage} readOnly={!guest} />
    </>
  );
}
