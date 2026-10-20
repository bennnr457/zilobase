import { useLayoutEffect, useEffect, useRef } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { useChatSelection } from "@zilobase/features/ai/react";
import { PageLayout } from "@/sections/pages/layout/components/page-layout";
import { PageWorkspaceGate } from "@/sections/workspaces/access/components/page-workspace-gate";
import { usePageSidePane } from "@/sections/pages/presentation/components/page-presentation";
import { useOpenEmbeddedPage } from "@/sections/pages/navigation/hooks/page-navigation";
import { DatabaseMainPane } from "@/sections/databases/database-screen";
import { PageContent } from "@/sections/pages/editor/page-content";
import { AskAiWorkspace } from "./workspace/components/ask-ai-workspace";

export default function AiScreen() {
  const workspaceId = useActiveWorkspaceId();
  const selection = useChatSelection(workspaceId ?? "");
  const search = useSearch({ strict: false });
  const thread = search.thread;
  const navigate = useNavigate();
  const pendingUrl = useRef<string | null | undefined>(undefined);
  const previous = useRef<{
    workspaceId: string | null | undefined;
    thread: string | undefined;
  } | null>(null);
  useLayoutEffect(() => {
    if (!workspaceId) return;
    if (
      !previous.current ||
      previous.current.workspaceId !== workspaceId ||
      previous.current.thread !== thread
    ) {
      const changed = previous.current !== null && previous.current.workspaceId === workspaceId;
      previous.current = { workspaceId, thread };
      if ((thread || changed) && selection.id !== (thread ?? null)) {
        pendingUrl.current = thread ?? null;
        selection.select(thread ?? null);
      }
    }
  }, [workspaceId, thread, selection]);
  useEffect(() => {
    if (pendingUrl.current !== undefined) {
      if (selection.id !== pendingUrl.current) return;
      pendingUrl.current = undefined;
    }
    if (!workspaceId || !selection.initialized || selection.id === (thread ?? null)) return;
    void navigate({ to: "/ai", search: { thread: selection.id ?? undefined }, replace: true });
  }, [workspaceId, selection.id, selection.initialized, thread, navigate]);
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
