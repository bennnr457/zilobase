import { PageLayout } from "@/components/pages/pane/page-layout";
import { PageWorkspaceGate } from "@/components/workspaces";
import { usePageSidePane } from "@/components/pages/pane/page-side-pane";
import { useOpenEmbeddedPage } from "@/components/pages/pane/use-open-embedded-page";
import { DatabaseMainPane } from "@/components/databases/core/index";
import { PageEditorPane } from "@/components/pages/pane/page-editor-pane";
import { AskAiWorkspace } from "./ask-ai-workspace";

export default function AiPage() {
  const {
    closeSidePane,
    openSidePaneAsFullPage,
    renderedSidePaneDatabaseId,
    renderedSidePanePageId,
    sidePaneAnimatedOpen,
    sidePaneContentReady,
    sidePaneDatabaseId,
  } = usePageSidePane();
  const { openPage } = useOpenEmbeddedPage({
    contextPageId: null,
    databaseId: null,
    page: null,
  });
  const openSidePaneChildPage = (pageId: string) => {
    openPage(pageId, { databaseId: sidePaneDatabaseId });
  };

  const externalSidePane =
    sidePaneContentReady && (renderedSidePanePageId || renderedSidePaneDatabaseId) ? (
      renderedSidePaneDatabaseId ? (
        <PageLayout
          pageId={null}
          databaseId={renderedSidePaneDatabaseId}
          placement="pane"
          onClose={closeSidePane}
          onOpenFullPage={openSidePaneAsFullPage}
        >
          <DatabaseMainPane
            className="min-h-0 flex-1"
            databaseId={renderedSidePaneDatabaseId}
            embedded
            key={renderedSidePaneDatabaseId}
            onOpenPage={openSidePaneChildPage}
          />
        </PageLayout>
      ) : renderedSidePanePageId ? (
        <PageWorkspaceGate pageId={renderedSidePanePageId}>
          <PageLayout
            pageId={renderedSidePanePageId}
            placement="pane"
            rowNavigationDatabaseId={sidePaneDatabaseId}
            onClose={closeSidePane}
            onOpenFullPage={openSidePaneAsFullPage}
          >
            <PageEditorPane
              databaseId={sidePaneDatabaseId}
              enableComments={false}
              key={renderedSidePanePageId}
              layoutPanelMode="overlay"
              onOpenPage={openSidePaneChildPage}
              pageId={renderedSidePanePageId}
            />
          </PageLayout>
        </PageWorkspaceGate>
      ) : null
    ) : null;

  return (
    <AskAiWorkspace
      externalSidePane={externalSidePane}
      externalSidePaneOpen={sidePaneAnimatedOpen}
      externalSidePaneVisible={Boolean(renderedSidePanePageId || renderedSidePaneDatabaseId)}
    />
  );
}
