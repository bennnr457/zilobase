import { useTaskDatabases } from "@zilobase/features/tasks/react";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, ListChecksIcon } from "@/components/icons";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { buildTaskRows, filterMyTaskRows, getTaskDatabaseSchema } from "@zilobase/features/tasks";
import { useSession } from "@zilobase/features/auth/react";

import { useSidebarSectionOpen } from "../model/local-state";

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
