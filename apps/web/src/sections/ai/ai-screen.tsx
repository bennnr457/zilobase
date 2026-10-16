import { PageLayout } from "@/sections/pages/layout/components/page-layout";
import { PageWorkspaceGate } from "@/sections/workspaces/access/components/page-workspace-gate";
import { usePageSidePane } from "@/sections/pages/presentation/components/page-presentation";
import { useOpenEmbeddedPage } from "@/sections/pages/navigation/hooks/page-navigation";
import { DatabaseMainPane } from "@/sections/databases/database-screen";
import { PageContent } from "@/sections/pages/editor/page-content";
import { AskAiWorkspace } from "./workspace/components/ask-ai-workspace";

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
