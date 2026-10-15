import { PageLayout } from "@/components/pages/layout/page-layout";
import { useParams } from "@tanstack/react-router";

import { FallbackErrorBoundary } from "@/components/desktop/diagnostics/fallback-error-boundary";
import { PageWorkspaceGate } from "@/components/workspaces/access/page-workspace-gate";
import { PageSidePaneLayout } from "@/components/pages/presentation/page-side-pane";
import { usePageSidePane } from "@/components/pages/presentation/page-presentation";
import { useOpenEmbeddedPage } from "@/components/pages/navigation/page-navigation";
import { usePageTitleDraft } from "@/components/pages/content/use-page-title-draft";
import { PageMetadata as PageMetadataHeader } from "@/components/databases/page-properties/page-metadata";
import { MeetingView } from "@/components/editor/extensions/meeting/meeting-view";
import { PageContent } from "@/components/pages/content/page-content";
import { useMeeting, useUpdateMeeting } from "@zilobase/features/meetings/react";
import {
  getPageCover,
  getPageEmoji,
  getPageIconPosition,
  isMeetingLocked,
  resolvePageFullWidth,
  type PageIconPosition,
  type PageMetadata,
} from "@zilobase/features/pages";
import { usePage, usePageAccessLevel, useUpdatePage } from "@zilobase/features/pages/react";
import { useUserSettings } from "@zilobase/features/user-settings/react";
import { useSession } from "@zilobase/features/auth/react";
import { LoaderCircle } from "@/components/icons";
import type { OpenPageOptions } from "@/components/pages/navigation/page-navigation";

export default function MeetingScreen() {
  const { meetingId } = useParams({ from: "/m/$meetingId" });
  const { data: session } = useSession();

  if (!session?.user) {
    return (
      <main className="flex min-h-svh items-center justify-center px-4 text-sm text-content-secondary">
        Sign in to open this meeting.
      </main>
    );
  }

  return (
    <FallbackErrorBoundary
      fallback={
        <main className="flex min-h-svh items-center justify-center px-4 text-sm text-content-secondary">
          This meeting is unavailable.
        </main>
      }
      key={meetingId}
      name="meeting.authenticated"
    >
      <AuthenticatedMeetingPage />
    </FallbackErrorBoundary>
  );
}

function AuthenticatedMeetingPage() {
  const { meetingId } = useParams({ from: "/m/$meetingId" });
  const { data, isLoading } = useMeeting(meetingId);
  const notesPageId = data?.meeting.notesPageId ?? null;
  const { data: notesPage } = usePage(notesPageId);
  const {
    closeSidePane,
    openSidePaneAsFullPage,
    renderedSidePanePageId,
    sidePaneAnimatedOpen,
    sidePaneContentReady,
    sidePaneDatabaseId,
  } = usePageSidePane();
  const { openPage } = useOpenEmbeddedPage({
    contextPageId: notesPageId,
    page: notesPage,
  });

  if (isLoading) {
    return (
      <PageSidePaneLayout
        main={
          <main className="flex min-h-[calc(100svh-3rem)] items-center justify-center">
            <LoaderCircle className="size-5 animate-spin text-content-secondary" />
          </main>
        }
        sidePane={null}
        sidePaneOpen={false}
        sidePaneVisible={false}
      />
    );
  }

  if (!data?.meeting) {
    return (
      <PageSidePaneLayout
        main={
          <main className="flex min-h-[calc(100svh-3rem)] items-center justify-center px-4 text-sm text-content-secondary">
            Meeting not found.
          </main>
        }
        sidePane={null}
        sidePaneOpen={false}
        sidePaneVisible={false}
      />
    );
  }

  return (
    <PageSidePaneLayout
      className="animate-in fade-in-0 duration-300"
      main={
        <MeetingMainPane meetingId={meetingId} notesPageId={notesPageId} onOpenPage={openPage} />
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
            <PageContent
              databaseId={sidePaneDatabaseId}
              enableComments={false}
              key={renderedSidePanePageId}
              onOpenPage={openPage}
              pageId={renderedSidePanePageId}
            />
          </PageLayout>
        ) : null
      }
      sidePaneOpen={sidePaneAnimatedOpen}
      sidePaneVisible={renderedSidePanePageId !== null}
    />
  );
}

function MeetingMainPane({
  meetingId,
  notesPageId,
  onOpenPage,
}: {
  meetingId: string;
  notesPageId: string | null;
  onOpenPage: (pageId: string, options?: OpenPageOptions) => void;
}) {
  const { data } = useMeeting(meetingId);
  const meeting = data?.meeting;
  const metadataPageId = notesPageId ?? meeting?.pageId ?? null;
  const { data: metadataPage } = usePage(metadataPageId);
  const { data: hostPage } = usePage(meeting?.pageId);
  const { data: notesAccessLevel } = usePageAccessLevel(notesPageId);
  const { data: hostAccessLevel } = usePageAccessLevel(meeting?.pageId);
  const { data: userSettings } = useUserSettings();
  const updateMeeting = useUpdateMeeting(meetingId);
  const updatePage = useUpdatePage();
  const accessLevel = notesAccessLevel ?? hostAccessLevel;
  const editable =
    !isMeetingLocked(metadataPage) && (accessLevel === "edit" || accessLevel === "full");
  const fullWidth = resolvePageFullWidth(metadataPage, userSettings?.pageFullWidth);
  const metadata = (metadataPage?.metadata ?? {}) as PageMetadata;
  const cover = metadataPage ? (getPageCover(metadataPage) ?? "") : "";
  const emoji = metadataPage ? (getPageEmoji(metadataPage) ?? "") : "";
  const iconPosition = metadataPage ? getPageIconPosition(metadataPage) : "top";
  const { setTitle, title } = usePageTitleDraft({
    enabled: editable,
    onSave: async (nextTitle) => {
      if (!meeting) return;
      await updateMeeting.mutateAsync({ title: nextTitle });
    },
    sourceId: meeting?.id ?? null,
    sourceTitle: meeting?.title ?? "Meeting",
  });

  const updateMetadata = (patch: Partial<PageMetadata>) => {
    if (!editable || !metadataPageId) return;
    updatePage.mutate({
      id: metadataPageId,
      metadata: { ...metadata, ...patch },
    });
  };

  const content = meeting ? (
    <section className="animate-in fade-in-0 duration-300">
      <PageMetadataHeader
        afterHeading={
          <MeetingView
            editable={editable}
            embeddedPage={{
              emoji: hostPage ? getPageEmoji(hostPage) : null,
              id: meeting.pageId,
              name: hostPage?.name?.trim() || "Page",
            }}
            fullPage
            meetingId={meetingId}
            onOpenPage={onOpenPage}
            showTitle={false}
          />
        }
        collaborationUsers={[]}
        contentClassName={fullWidth ? "" : "mx-auto max-w-5xl"}
        cover={cover}
        editable={editable}
        enableComments={false}
        headingLabel="Meeting"
        icon={emoji}
        iconPosition={iconPosition}
        onCoverChange={(nextCover) => updateMetadata({ cover: nextCover })}
        onIconChange={(nextEmoji) => updateMetadata({ emoji: nextEmoji })}
        onIconPositionChange={(nextPosition: PageIconPosition) =>
          updateMetadata({ iconPosition: nextPosition })
        }
        onOpenPage={(pageId) => onOpenPage(pageId)}
        onTitleChange={setTitle}
        pageId={metadataPageId}
        title={title}
        workspaceId={meeting.workspaceId}
      />
    </section>
  ) : (
    <section className="flex min-h-[calc(100svh-3rem)] items-center justify-center">
      <LoaderCircle className="size-5 animate-spin text-content-secondary" />
    </section>
  );

  return notesPageId ? (
    <PageWorkspaceGate pageId={notesPageId}>{content}</PageWorkspaceGate>
  ) : (
    content
  );
}
