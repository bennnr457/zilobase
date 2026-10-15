import { Effect } from "effect";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronUp,
  ChevronsRight,
  Layers3Icon,
  LockIcon,
  CalendarIcon,
  Maximize2,
  UsersIcon,
  XIcon,
} from "@/components/icons";
import { toast } from "sonner";

import { NavActions } from "@/components/pages/item-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { libraryViewIcons } from "@/components/library/library-icons";
import { libraryViewLabels } from "@/components/library/library-model";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { useDatabaseBootstrap, useDatabaseRecords } from "@zilobase/features/databases/react";
import { useMeeting } from "@zilobase/features/meetings/react";
import { useTeamspaces } from "@zilobase/features/teamspaces/react";
import {
  defaultUserSettings,
  libraryViewIds,
  type LibraryView,
} from "@zilobase/features/user-settings";
import { useUpdateUserSettings, useUserSettings } from "@zilobase/features/user-settings/react";
import { getDatabaseIconNode, getPageIconNode, PageIconDisplay } from "../icons/page-icon";
import { DEFAULT_DATABASE_ITEM_ICON, DEFAULT_MEETING_ITEM_ICON } from "../icons/item-icons";
import { resolveEmbeddedItemsOpenAs, type EmbeddedItemsOpenAs } from "@zilobase/features/pages";
import { usePage, usePageNavigation } from "@zilobase/features/pages/react";
import { EmbeddedItemPresentationDropdown } from "./embedded-item-presentation-dropdown";
import {
  buildCanonicalBreadcrumbTrail,
  getBreadcrumbNavigationSection,
  type BreadcrumbNavigationItem,
} from "@zilobase/features/pages";
import { useOptionalPageSidePane } from "./page-side-pane";
import {
  isPublishedFallbackPage,
  readPublishedEmbeddedItemsOpenAs,
  writePublishedEmbeddedItemsOpenAs,
} from "../publication/published-page-preferences";
import { getDatabaseId, getMeetingId, getPageId } from "../navigation/route-item-id";
import {
  getPageConnectionIndicator,
  subscribePageConnectionIndicator,
} from "@/components/editor/collaboration/page-connection-indicator";

export { getDatabaseId } from "../navigation/route-item-id";

export function useRoutePageId(pathname: string) {
  const routePageId = getPageId(pathname);
  const meetingId = getMeetingId(pathname);
  const { data } = useMeeting(meetingId);
  return routePageId ?? data?.meeting.notesPageId ?? null;
}

export type PagePaneHeaderProps = {
  actions?: ReactNode | null;
  className?: string;
  discussionsOpen?: boolean;
  leadingControl?: ReactNode | null;
  onClose?: () => void;
  onOpenFullPage?: () => void;
  onToggleDiscussions?: () => void;
  onTogglePageSidebar?: () => void;
  pageSidebarOpen?: boolean;
  pathname: string;
  pageId?: string | null;
  databaseId?: string | null;
  placement?: "main" | "pane" | "dialog";
  rowNavigationDatabaseId?: string | null;
  showActions?: boolean;
  showBreadcrumb?: boolean;
};

export const PageHeaderControlsContext = createContext<
  { pageId?: string | null } & Pick<
    PagePaneHeaderProps,
    "discussionsOpen" | "onToggleDiscussions" | "onTogglePageSidebar" | "pageSidebarOpen"
  >
>({});

export function PagePaneHeader({
  actions,
  className,
  discussionsOpen,
  leadingControl,
  onClose,
  onOpenFullPage,
  onToggleDiscussions,
  onTogglePageSidebar,
  pageSidebarOpen,
  pathname,
  pageId: explicitPageId,
  databaseId: explicitDatabaseId,
  placement = "main",
  rowNavigationDatabaseId,
  showActions = true,
  showBreadcrumb = true,
}: PagePaneHeaderProps) {
  const routePageId = useRoutePageId(explicitPageId === undefined ? pathname : "");
  const pageId = explicitPageId === undefined ? routePageId : explicitPageId;
  const databaseId =
    explicitDatabaseId === undefined ? getDatabaseId(pathname) : explicitDatabaseId;
  const meetingId = explicitPageId === undefined ? getMeetingId(pathname) : null;
  const controls = useContext(PageHeaderControlsContext);
  const main = placement === "main" && (explicitPageId === undefined || controls.pageId === pageId);
  const leadingControls =
    placement !== "main" ? (
      <PagePaneControls
        leadingControl={leadingControl}
        onClose={onClose}
        onOpenFullPage={onOpenFullPage}
        placement={placement}
        pathname={pathname}
        pageId={pageId}
        rowNavigationDatabaseId={rowNavigationDatabaseId}
      />
    ) : (
      leadingControl
    );

  return (
    <header
      data-page-header
      className={`flex min-h-12 shrink-0 flex-wrap items-center gap-2 ${className ?? ""}`}
    >
      <div
        className={`flex h-7 flex-1 items-center gap-2 px-3 ${placement === "main" ? "min-w-0" : "min-w-fit"}`}
      >
        {leadingControls}
        {showBreadcrumb ? <AppBreadcrumbs pathname={pathname} /> : null}
      </div>
      {showActions ? (
        <div className="ml-auto flex h-7 shrink-0 items-center px-3">
          {actions ?? (
            <NavActions
              databaseId={databaseId}
              meetingId={meetingId}
              discussionsOpen={discussionsOpen ?? (main && controls.discussionsOpen)}
              onToggleDiscussions={
                onToggleDiscussions ?? (main ? controls.onToggleDiscussions : undefined)
              }
              onTogglePageSidebar={
                (main ? controls.onTogglePageSidebar : undefined) ?? onTogglePageSidebar
              }
              pageSidebarOpen={(main ? controls.pageSidebarOpen : undefined) ?? pageSidebarOpen}
              pageId={pageId}
            />
          )}
        </div>
      ) : null}
    </header>
  );
}

export function MainPaneHeaderLeadingControl() {
  return (
    <>
      <SidebarTrigger className="shrink-0" />
      <Separator orientation="vertical" className="self-center! data-[orientation=vertical]:h-4" />
    </>
  );
}

export function PageSidePaneCollapseButton({
  label = "Close",
  onClick,
}: {
  label?: string;
  onClick: () => void;
}) {
  return (
    <Button aria-label={label} onClick={onClick} size="icon" type="button" variant="ghost">
      <ChevronsRight />
    </Button>
  );
}

function useRowNavigationPageIds(databaseId: string | null) {
  const databaseBootstrap = useDatabaseBootstrap(databaseId ? { databaseId } : null);
  const view = databaseBootstrap.data?.views[0] ?? null;
  const records = useDatabaseRecords(
    databaseId && view
      ? {
          databaseId,
          dataSourceId: view.dataSourceId,
          viewId: view.id,
        }
      : null,
  );

  useEffect(() => {
    if (records.status !== "success" || !records.hasMore || records.isFetchingNextPage) {
      return;
    }
    void records.fetchNextPage();
  }, [
    records.fetchNextPage,
    records.hasMore,
    records.isFetchingNextPage,
    records.records.length,
    records.status,
  ]);

  return useMemo(
    () => records.records.filter((row) => !row.page.deletedAt).map((row) => row.pageId),
    [records.records],
  );
}

function PagePaneControls({
  leadingControl,
  onClose,
  onOpenFullPage,
  placement,
  pathname,
  pageId,
  rowNavigationDatabaseId,
}: {
  leadingControl?: ReactNode | null;
  onClose?: () => void;
  onOpenFullPage?: () => void;
  placement: "pane" | "dialog";
  pathname: string;
  pageId: string | null;
  rowNavigationDatabaseId?: string | null;
}) {
  const sidePane = useOptionalPageSidePane();
  const { data: page } = usePage(pageId, { refetchOnMount: false });
  const { data: userSettings = defaultUserSettings } = useUserSettings();
  const updateUserSettings = useUpdateUserSettings();
  const isPublishedFallback = isPublishedFallbackPage(page);
  const [publishedEmbeddedItemsOpenAs, setPublishedEmbeddedItemsOpenAs] =
    useState<EmbeddedItemsOpenAs>(readPublishedEmbeddedItemsOpenAs);
  const mode = isPublishedFallback
    ? publishedEmbeddedItemsOpenAs
    : resolveEmbeddedItemsOpenAs(userSettings.embeddedItemsOpenAs);
  const rowDatabaseId = pageId ? rowNavigationDatabaseId : null;
  const isDialogPane = placement === "dialog";
  const rowPageIds = useRowNavigationPageIds(rowDatabaseId ?? null);
  const { nextRowPageId, previousRowPageId } = useMemo(() => {
    const currentRowIndex = pageId ? rowPageIds.indexOf(pageId) : -1;

    return {
      previousRowPageId: currentRowIndex > 0 ? rowPageIds[currentRowIndex - 1] : null,
      nextRowPageId:
        currentRowIndex >= 0 && currentRowIndex < rowPageIds.length - 1
          ? rowPageIds[currentRowIndex + 1]
          : null,
    };
  }, [pageId, rowPageIds]);

  const handleModeSelect = (nextMode: EmbeddedItemsOpenAs) => {
    if (!pageId) {
      return;
    }

    Effect.runSync(
      Effect.gen(function* () {
        if (isPublishedFallback) {
          yield* Effect.sync(() => writePublishedEmbeddedItemsOpenAs(nextMode));
          yield* Effect.sync(() => setPublishedEmbeddedItemsOpenAs(nextMode));
        } else {
          yield* Effect.sync(() =>
            updateUserSettings.mutate(
              { embeddedItemsOpenAs: nextMode },
              {
                onError: (error) => {
                  toast.error(
                    error instanceof Error ? error.message : "Could not update open pages setting.",
                  );
                },
              },
            ),
          );
        }

        if (nextMode === "dialog" && !isDialogPane) {
          yield* Effect.sync(() =>
            sidePane?.openEmbeddedPageDialog(pageId, { databaseId: rowDatabaseId }),
          );
        } else if (nextMode === "sidepanel" && isDialogPane) {
          yield* Effect.sync(() => sidePane?.openSidePane(pageId, { databaseId: rowDatabaseId }));
        }
      }),
    );
  };

  const openRowPage = (targetPageId: string | null) => {
    if (!targetPageId || !rowDatabaseId) {
      return;
    }

    if (isDialogPane) {
      sidePane?.openEmbeddedPageDialog(targetPageId, {
        databaseId: rowDatabaseId,
      });
    } else {
      sidePane?.openSidePane(targetPageId, { databaseId: rowDatabaseId });
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      {onClose ? (
        isDialogPane ? (
          <Button aria-label="Close" onClick={onClose} size="icon" variant="ghost">
            <XIcon />
          </Button>
        ) : (
          <PageSidePaneCollapseButton onClick={onClose} />
        )
      ) : (
        leadingControl
      )}
      <Button aria-label="Open as full page" asChild size="icon" variant="ghost">
        <Link
          to={pathname}
          onClick={(event) => {
            if (
              !onOpenFullPage ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey ||
              event.button !== 0
            )
              return;
            event.preventDefault();
            onOpenFullPage();
          }}
        >
          <Maximize2 />
        </Link>
      </Button>
      {pageId ? (
        <EmbeddedItemPresentationDropdown
          disabled={!isPublishedFallback && updateUserSettings.isPending}
          itemLabel="pages"
          mode={mode}
          onSelect={handleModeSelect}
        />
      ) : null}
      {rowDatabaseId ? (
        <div className="contents">
          <Separator
            orientation="vertical"
            className="mx-1 self-center! data-[orientation=vertical]:h-4"
          />
          <Button
            aria-label="Open previous row"
            disabled={!previousRowPageId}
            onClick={() => openRowPage(previousRowPageId)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronUp />
          </Button>
          <Button
            aria-label="Open next row"
            disabled={!nextRowPageId}
            onClick={() => openRowPage(nextRowPageId)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronDown />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AppBreadcrumbs({ pathname }: { pathname: string }) {
  const location = useLocation();
  const pageId = getPageId(pathname);
  const databaseId = getDatabaseId(pathname);
  const meetingId = getMeetingId(pathname);

  if (pageId) {
    return <PageBreadcrumb pageId={pageId} />;
  }

  if (databaseId) {
    return <DatabaseBreadcrumb databaseId={databaseId} />;
  }

  if (meetingId) {
    return <MeetingBreadcrumb meetingId={meetingId} />;
  }

  if (pathname.startsWith("/settings")) {
    const settingsPageTitle = getSettingsPageTitle(pathname);

    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden sm:inline-flex">
            <BreadcrumbLink render={<Link to="/settings" />}>Settings</BreadcrumbLink>
          </BreadcrumbItem>
          {settingsPageTitle ? (
            <>
              <BreadcrumbSlash className="hidden sm:inline-flex" />
              <BreadcrumbItem>
                <BreadcrumbPage className="line-clamp-1">{settingsPageTitle}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : null}
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (pathname === "/canvas") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">Canvas</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (pathname === "/calendar") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="flex items-center gap-1.5">
              <CalendarIcon className="size-4" />
              Calendar
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (pathname === "/ai") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">Ask AI</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (pathname === "/recents") {
    const requestedView = location.search.view;
    const libraryView = libraryViewIds.includes(requestedView as LibraryView)
      ? (requestedView as LibraryView)
      : "recents";
    const LibraryViewIcon = libraryViewIcons[libraryView];

    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/recents" />}>Library</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSlash />
          <BreadcrumbItem>
            <BreadcrumbPage className="gap-1.5">
              <LibraryViewIcon aria-hidden="true" className="size-4 shrink-0" />
              <span className="line-clamp-1">{libraryViewLabels[libraryView]}</span>
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage className="line-clamp-1">Recents</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function PageBreadcrumb({ pageId }: { pageId: string }) {
  const workspaceId = useActiveWorkspaceId();
  const { data: navigation } = usePageNavigation(workspaceId);
  const { data: teamspaces = [] } = useTeamspaces(workspaceId);
  const trail = navigation
    ? buildCanonicalBreadcrumbTrail(
        { id: pageId, kind: "page" },
        navigation.pages,
        navigation.databases,
        navigation.placements,
      )
    : [];
  const entries = buildBreadcrumbEntries(trail, teamspaces, pageId);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <CollapsedBreadcrumbTrail entries={entries} />
      <PageConnectionDot pageId={pageId} />
    </div>
  );
}

function PageConnectionDot({ pageId }: { pageId: string }) {
  const subscribe = useCallback(
    (listener: () => void) => subscribePageConnectionIndicator(pageId, listener),
    [pageId],
  );
  const getSnapshot = useCallback(() => getPageConnectionIndicator(pageId), [pageId]);
  const indicator = useSyncExternalStore(subscribe, getSnapshot, () => null);
  if (!indicator) return null;

  const label = indicator === "connected" ? "Collaboration connected" : "Connecting collaboration";
  return (
    <span
      aria-label={label}
      className={`size-2 shrink-0 rounded-full ${
        indicator === "connected" ? "bg-feedback-success" : "bg-feedback-warning"
      }`}
      role="status"
      title={label}
    />
  );
}

function MeetingBreadcrumb({ meetingId }: { meetingId: string }) {
  const { data } = useMeeting(meetingId);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="hidden sm:inline-flex">
          <BreadcrumbPage className="inline-flex items-center gap-1.5">
            <PageIconDisplay size="sm" value={DEFAULT_MEETING_ITEM_ICON} />
            Meetings
          </BreadcrumbPage>
        </BreadcrumbItem>
        <BreadcrumbSlash className="hidden sm:inline-flex" />
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="block max-w-64 truncate sm:max-w-80 md:max-w-96 lg:max-w-[42rem]">
            <span className="inline-flex items-center gap-1.5">
              <PageIconDisplay size="sm" value={DEFAULT_MEETING_ITEM_ICON} />
              {data?.meeting.title.trim() || "Meeting"}
            </span>
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function DatabaseBreadcrumb({ databaseId }: { databaseId: string }) {
  const workspaceId = useActiveWorkspaceId();
  const { data: payload } = useDatabaseBootstrap({
    databaseId,
    includeDeleted: true,
  });
  const { data: navigation } = usePageNavigation(workspaceId);
  const { data: teamspaces = [] } = useTeamspaces(workspaceId);
  const trail = navigation
    ? buildCanonicalBreadcrumbTrail(
        { id: databaseId, kind: "database" },
        navigation.pages,
        navigation.databases,
        navigation.placements,
      )
    : [];
  const fallbackTrail =
    trail.length === 0 && payload?.database
      ? [
          {
            database: { ...payload.database, views: payload.views },
            id: databaseId,
            kind: "database" as const,
          },
        ]
      : trail;
  const entries = buildBreadcrumbEntries(fallbackTrail, teamspaces, databaseId);

  return <CollapsedBreadcrumbTrail entries={entries} />;
}

type AppBreadcrumbTarget =
  | { type: "library"; view: "private" | "shared" }
  | { type: "recents" }
  | { databaseId: string; type: "database" }
  | { pageId: string; type: "page" };

type AppBreadcrumbEntry = {
  current?: boolean;
  id: string;
  icon?: ReactNode;
  label: string;
  target?: AppBreadcrumbTarget;
};

function CollapsedBreadcrumbTrail({ entries }: { entries: AppBreadcrumbEntry[] }) {
  const shouldCollapse = entries.length > 3;
  const firstEntry = entries[0];
  const collapsedEntries = shouldCollapse ? entries.slice(1, -2) : [];
  const trailingEntries = shouldCollapse ? entries.slice(-2) : entries.slice(1);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {firstEntry ? <BreadcrumbTrailEntry entry={firstEntry} /> : null}
        {collapsedEntries.length > 0 ? (
          <>
            <BreadcrumbSlash />
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="More pages"
                    className="-m-1.5 text-content-secondary"
                    size="icon-sm"
                    variant="ghost"
                  >
                    <BreadcrumbEllipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {collapsedEntries.map((entry) => (
                    <CollapsedBreadcrumbMenuItem entry={entry} key={entry.id} />
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
          </>
        ) : null}
        {trailingEntries.map((entry) => (
          <BreadcrumbTrailPart entry={entry} key={entry.id} />
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function BreadcrumbTrailPart({ entry }: { entry: AppBreadcrumbEntry }) {
  return (
    <>
      <BreadcrumbSlash />
      <BreadcrumbTrailEntry entry={entry} />
    </>
  );
}

function BreadcrumbTrailEntry({ entry }: { entry: AppBreadcrumbEntry }) {
  return (
    <BreadcrumbItem className="min-w-0">
      {entry.current || !entry.target ? (
        <BreadcrumbPage className="block max-w-64 truncate sm:max-w-80 md:max-w-96 lg:max-w-[42rem]">
          <BreadcrumbEntryContent entry={entry} />
        </BreadcrumbPage>
      ) : (
        <BreadcrumbEntryLink entry={entry} />
      )}
    </BreadcrumbItem>
  );
}

function BreadcrumbEntryLink({ entry }: { entry: AppBreadcrumbEntry }) {
  if (entry.target?.type === "page") {
    return (
      <BreadcrumbLink
        className="block max-w-32 truncate sm:max-w-48"
        render={<Link params={{ pageId: entry.target.pageId }} to="/p/$pageId" />}
      >
        <BreadcrumbEntryContent entry={entry} />
      </BreadcrumbLink>
    );
  }

  if (entry.target?.type === "library") {
    return (
      <BreadcrumbLink
        className="block max-w-32 truncate sm:max-w-48"
        render={<Link search={{ view: entry.target.view } as never} to="/recents" />}
      >
        <BreadcrumbEntryContent entry={entry} />
      </BreadcrumbLink>
    );
  }

  if (entry.target?.type === "database") {
    return (
      <BreadcrumbLink
        className="flex max-w-32 items-center gap-1.5 truncate sm:max-w-48"
        render={
          <Link
            params={{ databaseId: entry.target.databaseId }}
            search={{ view: undefined }}
            to="/d/$databaseId"
          />
        }
      >
        <BreadcrumbEntryContent entry={entry} />
      </BreadcrumbLink>
    );
  }

  return (
    <BreadcrumbLink className="block max-w-32 truncate sm:max-w-48" render={<Link to="/recents" />}>
      <BreadcrumbEntryContent entry={entry} />
    </BreadcrumbLink>
  );
}

function CollapsedBreadcrumbMenuItem({ entry }: { entry: AppBreadcrumbEntry }) {
  if (entry.target?.type === "page") {
    return (
      <DropdownMenuItem asChild>
        <Link params={{ pageId: entry.target.pageId }} to="/p/$pageId">
          <BreadcrumbEntryContent entry={entry} />
        </Link>
      </DropdownMenuItem>
    );
  }

  if (entry.target?.type === "library") {
    return (
      <DropdownMenuItem asChild>
        <Link search={{ view: entry.target.view } as never} to="/recents">
          <BreadcrumbEntryContent entry={entry} />
        </Link>
      </DropdownMenuItem>
    );
  }

  if (entry.target?.type === "database") {
    return (
      <DropdownMenuItem asChild>
        <Link
          params={{ databaseId: entry.target.databaseId }}
          search={{ view: undefined }}
          to="/d/$databaseId"
        >
          <BreadcrumbEntryContent entry={entry} />
        </Link>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem asChild>
      <Link to="/recents">
        <BreadcrumbEntryContent entry={entry} />
      </Link>
    </DropdownMenuItem>
  );
}

function BreadcrumbSlash({ className }: { className?: string }) {
  return <BreadcrumbSeparator className={className}>/</BreadcrumbSeparator>;
}

function BreadcrumbEntryContent({ entry }: { entry: AppBreadcrumbEntry }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {entry.icon}
      <span className="truncate">{entry.label}</span>
    </span>
  );
}

function buildBreadcrumbEntries(
  trail: BreadcrumbNavigationItem[],
  teamspaces: { id: string; name: string }[],
  currentId: string,
): AppBreadcrumbEntry[] {
  if (trail.length === 0) return [{ current: true, id: currentId, label: "Page" }];
  const section = getBreadcrumbNavigationSection(
    trail,
    new Map(teamspaces.map((teamspace) => [teamspace.id, teamspace.name])),
  );
  const sectionEntry: AppBreadcrumbEntry =
    section.kind === "teamspace"
      ? {
          icon: <Layers3Icon className="size-4" />,
          id: `teamspace-${section.teamspaceId}`,
          label: section.label,
        }
      : {
          icon:
            section.kind === "shared" ? (
              <UsersIcon className="size-4" />
            ) : (
              <LockIcon className="size-4" />
            ),
          id: `library-${section.kind}`,
          label: section.label,
          target: { type: "library", view: section.kind },
        };

  return [
    sectionEntry,
    ...trail.map((item, index): AppBreadcrumbEntry =>
      item.kind === "page"
        ? {
            current: index === trail.length - 1,
            icon: getPageIconNode(item.page),
            id: `page-${item.id}`,
            label: item.page.name.trim() || "Untitled",
            target: index === trail.length - 1 ? undefined : { pageId: item.id, type: "page" },
          }
        : {
            current: index === trail.length - 1,
            icon: getDatabaseIconNode(item.database) ?? (
              <PageIconDisplay size="sm" value={DEFAULT_DATABASE_ITEM_ICON} />
            ),
            id: `database-${item.id}`,
            label: item.database.name.trim() || "Database",
            target:
              index === trail.length - 1 ? undefined : { databaseId: item.id, type: "database" },
          },
    ),
  ];
}

function getSettingsPageTitle(pathname: string) {
  const pathParts = pathname.split("/").filter(Boolean);
  const page = pathParts[1];

  if (!page) {
    return null;
  }

  const titles: Record<string, string> = {
    preferences: "Preferences",
    workspace: "Workspace",
    profile: "Profile",
    team: "Team",
  };

  return titles[page] ?? null;
}
