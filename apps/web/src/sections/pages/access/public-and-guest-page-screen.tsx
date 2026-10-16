import { PageDesignEditorProvider } from "@/sections/pages/design/components/page-design-editor";
import { useParams } from "@tanstack/react-router";
import { PageSidePaneLayout } from "@/sections/pages/presentation/components/page-side-pane";
import {
  PageSidePaneProvider,
  usePageSidePane,
} from "@/sections/pages/presentation/components/page-presentation";
import { usePage } from "@zilobase/features/pages/react";
import { PageDialog } from "../presentation/components/page-dialog";
import { useOpenEmbeddedPage } from "../navigation/hooks/page-navigation";
import {
  GuestPageTitle,
  GuestPageActions,
  PublicPageBreadcrumb,
  PublicLoginButton,
} from "../header/components/public-page-header";
import { PageLayout } from "../layout/components/page-layout";
import { PageContent } from "../editor/page-content";

export function PublicPage() {
  const { pageId } = useParams({ from: "/p/$pageId" });

  return (
    <PageSidePaneProvider resetKey={pageId}>
      <PageDesignEditorProvider>
        <PublicPageContent pageId={pageId} />
      </PageDesignEditorProvider>
    </PageSidePaneProvider>
  );
}

export function GuestPage() {
  const { pageId } = useParams({ from: "/p/$pageId" });

  return (
    <PageSidePaneProvider resetKey={pageId}>
      <PageDesignEditorProvider>
        <PublicPageContent guest pageId={pageId} />
      </PageDesignEditorProvider>
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
            <PageContent key={pageId} onOpenPage={openPage} readOnly={!guest} pageId={pageId} />
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
                <PageContent
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
      <PageDialog onOpenPage={openPage} readOnly={!guest} />
    </>
  );
}
