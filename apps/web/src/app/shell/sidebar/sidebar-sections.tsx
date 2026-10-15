import {
  ChevronRightIcon,
  CalendarDays,
  ArrowUpRightIcon,
  ListChecksIcon,
} from "@/components/icons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroupAction,
} from "@/components/ui/sidebar";
import {
  useSidebarSectionOpen,
  getShortcutLabel,
  isShortcutActive,
} from "@/app/shell/sidebar/sidebar-state";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { PageIconDisplay } from "@/components/pages/index";
import { type MeetingListItem } from "@zilobase/features/meetings";
import { cn } from "@/lib/utils";
import {
  type LibraryView,
  type SidebarSectionId,
  type SidebarShortcut,
} from "@zilobase/features/user-settings";
import { SidebarShortcutIcon } from "@/app/shell/sidebar/sidebar-layout";
import { useTaskDatabases } from "@zilobase/features/tasks/react";
import { buildTaskRows, filterMyTaskRows, getTaskDatabaseSchema } from "@zilobase/features/tasks";
import { useSession } from "@zilobase/features/auth/react";

export function AiChatsSection({ storageKey }: { storageKey: string }) {
  const [open, setOpen] = useSidebarSectionOpen(storageKey);

  return (
    <Collapsible asChild onOpenChange={setOpen} open={open}>
      <SidebarGroup className="group/collapsible min-h-0">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel
            asChild
            className="hover:bg-action-neutral-hover hover:text-action-on-neutral"
          >
            <button className="group/section-label w-full cursor-pointer" type="button">
              <span>AI chats</span>
              <ChevronRightIcon className="ml-1 size-3 text-content-secondary transition-transform group-data-[state=open]/section-label:rotate-90" />
            </button>
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-4 pt-0.5">
          <SidebarGroupContent>
            <p className="text-xs text-content-secondary">No chats yet</p>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

export function NavMeetings({
  activeMeetingId,
  meetings,
  storageKey,
}: {
  activeMeetingId: string | null;
  meetings: MeetingListItem[];
  storageKey?: string;
}) {
  const [open, setOpen] = useSidebarSectionOpen(storageKey ?? "zilobase:sidebar-section:meetings");
  return (
    <Collapsible asChild onOpenChange={setOpen} open={open}>
      <SidebarGroup className="group/collapsible">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel
            asChild
            className="hover:bg-action-neutral-hover hover:text-action-on-neutral"
          >
            <button className="group/section-label w-full cursor-pointer" type="button">
              <span>Meetings</span>
              <ChevronRightIcon className="ml-1 size-3 text-content-secondary transition-transform group-data-[state=open]/section-label:rotate-90" />
            </button>
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-4 pt-0.5">
          <SidebarGroupContent>
            <SidebarMenu>
              {meetings.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-content-secondary">
                  Meeting blocks on pages appear here.
                </p>
              ) : (
                meetings.map((meeting) => (
                  <SidebarMenuItem key={meeting.id}>
                    <SidebarMenuButton asChild isActive={meeting.id === activeMeetingId}>
                      <Link params={{ meetingId: meeting.id }} to="/m/$meetingId">
                        {meeting.emoji ? (
                          <PageIconDisplay size="sm" value={meeting.emoji} />
                        ) : (
                          <CalendarDays />
                        )}
                        <span>{meeting.title.trim() || "Meeting"}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

export function SidebarLibraryLink({
  className,
  label,
  sectionId,
  view: viewOverride,
}: {
  className?: string;
  label: string;
  sectionId: SidebarSectionId;
  view?: LibraryView;
}) {
  const view = viewOverride ?? getLibraryViewForSection(sectionId);

  return (
    <SidebarGroupAction
      asChild
      className={cn(
        "transition-opacity md:opacity-0 md:group-hover/section-header:opacity-100 md:focus-visible:opacity-100",
        className,
      )}
    >
      <Link
        aria-label={`Open ${label} in Library`}
        search={{ view }}
        title={`Open ${label} in Library`}
        to="/recents"
      >
        <ArrowUpRightIcon />
      </Link>
    </SidebarGroupAction>
  );
}

function getLibraryViewForSection(sectionId: SidebarSectionId): LibraryView {
  return sectionId === "favorites" ? "favourites" : sectionId;
}

export function SidebarShortcutList({
  databases,
  onCreateChat,
  onCreateDatabase,
  onCreatePage,
  onOpenSettings,
  pages,
  settingsOpen,
  shortcuts,
}: {
  databases: Array<{ id: string; name: string; views: Array<{ id: string }> }>;
  onCreateChat: () => Promise<void>;
  onCreateDatabase: () => Promise<void>;
  onCreatePage: () => Promise<void>;
  onOpenSettings?: () => void;
  pages: Array<{ id: string; name: string }>;
  settingsOpen: boolean;
  shortcuts: SidebarShortcut[];
}) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <SidebarGroup className="pb-1">
      <SidebarGroupContent>
        <SidebarMenu aria-label="Shortcuts">
          {shortcuts.map((shortcut) => {
            const target = shortcut.target;
            const page =
              target.type === "page" ? pages.find((entry) => entry.id === target.pageId) : null;
            const database =
              target.type === "database"
                ? databases.find((entry) => entry.id === target.databaseId)
                : null;
            if ((target.type === "page" && !page) || (target.type === "database" && !database)) {
              return null;
            }

            const label =
              shortcut.label || page?.name || database?.name || getShortcutLabel(shortcut);
            const activate = () => {
              if (target.type === "action") {
                if (target.action === "createPage") void onCreatePage();
                else if (target.action === "createDatabase") void onCreateDatabase();
                else void onCreateChat();
              } else if (target.type === "page") {
                void navigate({ params: { pageId: target.pageId }, to: "/p/$pageId" });
              } else if (target.type === "database") {
                void navigate({
                  params: { databaseId: target.databaseId },
                  search: { view: target.viewId },
                  to: "/d/$databaseId",
                });
              } else if (target.type === "library") {
                void navigate({ search: { view: target.view }, to: "/recents" });
              } else if (target.route === "meetings") {
                void navigate({ search: { view: "meetings" }, to: "/recents" });
              } else if (target.route === "trash") {
                void navigate({ search: { view: "trash" }, to: "/recents" });
              } else if (target.route === "settings") {
                onOpenSettings?.();
              } else {
                void navigate({
                  to: target.route === "ai" ? "/ai" : "/tasks",
                });
              }
            };

            return (
              <SidebarMenuItem key={shortcut.id}>
                <SidebarMenuButton
                  isActive={isShortcutActive(
                    shortcut,
                    location.pathname,
                    location.search,
                    settingsOpen,
                  )}
                  onClick={activate}
                  type="button"
                >
                  <SidebarShortcutIcon shortcut={shortcut} />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function SidebarTasksSection({
  databaseIds,
  limit,
  storageKey,
}: {
  databaseIds: string[];
  limit: number;
  storageKey: string;
}) {
  const [open, setOpen] = useSidebarSectionOpen(storageKey);
  const { data: session } = useSession();
  const { queries, payloads: sources } = useTaskDatabases(open ? databaseIds : []);
  const payloads = sources.filter((payload) => getTaskDatabaseSchema(payload).missing.length === 0);
  const rows = filterMyTaskRows(buildTaskRows(payloads), session?.user?.id ?? null).slice(0, limit);

  return (
    <Collapsible asChild onOpenChange={setOpen} open={open}>
      <SidebarGroup className="group/collapsible">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel
            asChild
            className="hover:bg-action-neutral-hover hover:text-action-on-neutral"
          >
            <button className="group/section-label w-full cursor-pointer" type="button">
              <span>Tasks</span>
              <ChevronRightIcon className="ml-1 size-3 text-content-secondary transition-transform group-data-[state=open]/section-label:rotate-90" />
            </button>
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-4 pt-0.5">
          <SidebarGroupContent>
            <SidebarMenu aria-label="My tasks">
              {databaseIds.length === 0 ? (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to="/tasks">
                      <ListChecksIcon />
                      <span>Configure My Tasks</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : rows.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-content-secondary">
                  {queries.some((query) => query.isLoading)
                    ? "Loading tasks…"
                    : "No tasks assigned to you"}
                </p>
              ) : (
                rows.map((row) => (
                  <SidebarMenuItem key={`${row.databaseId}:${row.rowId}`}>
                    <SidebarMenuButton asChild>
                      <Link params={{ pageId: row.pageId }} to="/p/$pageId">
                        <ListChecksIcon />
                        <span>{row.title.trim() || "Untitled"}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
              {rows.length === limit ? (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to="/tasks">View all</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
