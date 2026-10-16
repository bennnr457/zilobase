import { PageLayout } from "@/components/pages/layout/page-layout";
import { PageWorkspaceGate } from "@/components/workspaces/access/page-workspace-gate";
import { usePageSidePane } from "@/components/pages/presentation/page-presentation";
import { useOpenEmbeddedPage } from "@/components/pages/navigation/page-navigation";
import { DatabaseMainPane } from "@/components/databases/screen/database-screen";
import { PageContent } from "@/components/pages/editor/page-content";
import { AskAiWorkspace } from "./workspace/ask-ai-workspace";

export default function AiScreen() {
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
            <PageContent
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
