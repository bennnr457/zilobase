import { ChevronsLeft, ChevronsRight } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  GanttNav,
  GanttNavToday,
  GanttNavPrev,
  GanttNavNext,
  GanttScaleSwitcher,
  GanttTitle,
} from "@/components/ui/gantt/gantt-nav";
import { TooltipProvider } from "@/components/ui/tooltip";

export function DatabaseTimelineToolbarChrome({
  sidebarCollapsed,
  onSidebarCollapsedChange,
}: {
  sidebarCollapsed: boolean;
  onSidebarCollapsedChange: (collapsed: boolean) => void;
}) {
  return (
    <GanttNav className="database-timeline-toolbar h-10 min-h-10 flex-none flex-nowrap gap-1 border-0 px-0 py-0">
      <Button
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        variant="ghost"
        size="icon"
        onClick={() => onSidebarCollapsedChange(!sidebarCollapsed)}
      >
        {sidebarCollapsed ? <ChevronsRight /> : <ChevronsLeft />}
      </Button>
      <TooltipProvider delayDuration={600}>
        <GanttTitle className="min-w-0 flex-1 truncate" />
        <GanttScaleSwitcher />
        <GanttNavToday />
        <GanttNavPrev />
        <GanttNavNext />
      </TooltipProvider>
    </GanttNav>
  );
}
