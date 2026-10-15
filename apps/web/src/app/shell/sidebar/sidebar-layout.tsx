import {
  BotIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  CircleDashedIcon,
  DatabaseIcon,
  FileIcon,
  FolderIcon,
  HomeIcon,
  ListIcon,
  ListChecksIcon,
  SettingsIcon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
  PlusIcon,
  SearchIcon,
} from "@/components/icons";
import {
  type SidebarShortcut,
  type SidebarTabIconId,
  isFixedSidebarTabId,
  type SidebarTab,
} from "@zilobase/features/user-settings";
import { PageIconDisplay } from "@/components/pages/index";
import { libraryViewIcons } from "@/components/library/library-icons";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "framer-motion";
import type * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getAppTabTriggerClassName } from "@/components/ui/app-tabs";

const sidebarTabIcons = {
  briefcase: BriefcaseIcon,
  calendar: CalendarDaysIcon,
  circle: CircleDashedIcon,
  database: DatabaseIcon,
  folder: FolderIcon,
  home: HomeIcon,
  list: ListIcon,
  sparkles: SparklesIcon,
  star: StarIcon,
} satisfies Record<SidebarTabIconId, typeof HomeIcon>;

export function SidebarTabIcon({ value }: { value: string }) {
  const Icon = sidebarTabIcons[value as SidebarTabIconId];
  return Icon ? (
    <Icon aria-hidden="true" className="size-4" />
  ) : (
    <PageIconDisplay className="pointer-events-none" size="sm" value={value} />
  );
}

export function SidebarShortcutIcon({ shortcut }: { shortcut: SidebarShortcut }) {
  if (shortcut.icon) return <SidebarTabIcon value={shortcut.icon} />;

  const Icon = getDefaultShortcutIcon(shortcut.target);
  return <Icon aria-hidden="true" className="size-4" />;
}

function getDefaultShortcutIcon(target: SidebarShortcut["target"]) {
  if (target.type === "action") {
    return target.action === "createPage"
      ? FileIcon
      : target.action === "createDatabase"
        ? DatabaseIcon
        : BotIcon;
  }
  if (target.type === "page") return FileIcon;
  if (target.type === "database") return DatabaseIcon;
  if (target.type === "library") return libraryViewIcons[target.view];
  return {
    ai: SparklesIcon,
    meetings: CalendarDaysIcon,
    settings: SettingsIcon,
    tasks: ListChecksIcon,
    trash: Trash2Icon,
  }[target.route];
}

export function SidebarLayoutTabs({
  activeTabId,
  activeTabSettings,
  editing = false,
  onAddTab,
  onOpenSearch,
  onReorderTab,
  onSelectTab,
  tabs,
}: {
  activeTabId: string;
  activeTabSettings?: React.ReactNode;
  editing?: boolean;
  onAddTab?: () => void;
  onOpenSearch: () => void;
  onReorderTab?: (activeTabId: string, overTabId: string) => void;
  onSelectTab: (tabId: string) => void;
  tabs: SidebarTab[];
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onReorderTab?.(String(active.id), String(over.id));
  };

  return (
    <TooltipProvider>
      <nav aria-label="Sidebar tabs" className="relative z-10 bg-surface-navigation px-2 py-2">
        <div className="flex min-w-0 items-center gap-1">
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <SortableContext
                items={tabs.filter((tab) => !isFixedSidebarTabId(tab.id)).map((tab) => tab.id)}
                strategy={horizontalListSortingStrategy}
              >
                {tabs.map((tab) => (
                  <SidebarLayoutTab
                    active={tab.id === activeTabId}
                    activeTabSettings={activeTabSettings}
                    editing={editing}
                    key={tab.id}
                    onSelectTab={onSelectTab}
                    tab={tab}
                  />
                ))}
              </SortableContext>
              {editing && tabs.length < 8 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      aria-label="Add tab"
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-content-secondary outline-none transition-colors hover:bg-action-neutral-hover hover:text-action-on-neutral focus-visible:ring-2 focus-visible:ring-action-focus-ring active:bg-action-neutral-pressed"
                      onClick={onAddTab}
                      type="button"
                    >
                      <PlusIcon className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6}>
                    Add tab
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </DndContext>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label="Search"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-content-secondary outline-none transition-colors hover:bg-action-neutral-hover hover:text-action-on-neutral focus-visible:ring-2 focus-visible:ring-action-focus-ring active:bg-action-neutral-pressed"
                onClick={onOpenSearch}
                type="button"
              >
                <SearchIcon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              Search
            </TooltipContent>
          </Tooltip>
        </div>
      </nav>
    </TooltipProvider>
  );
}

function SidebarLayoutTab({
  active,
  activeTabSettings,
  editing,
  onSelectTab,
  tab,
}: {
  active: boolean;
  activeTabSettings?: React.ReactNode;
  editing: boolean;
  onSelectTab: (tabId: string) => void;
  tab: SidebarTab;
}) {
  const canDrag = editing && !isFixedSidebarTabId(tab.id);
  const sortable = useSortable({
    animateLayoutChanges: ({ isSorting }) => isSorting,
    disabled: !canDrag,
    id: tab.id,
  });
  const button = (
    <motion.button
      {...(canDrag ? sortable.attributes : {})}
      {...(canDrag ? sortable.listeners : {})}
      animate="animate"
      aria-current={active ? "page" : undefined}
      aria-label={tab.name}
      className={getAppTabTriggerClassName(
        cn(
          "transition-[color,background-color,box-shadow]",
          canDrag && "cursor-grab touch-none active:cursor-grabbing",
          (sortable.isDragging || sortable.isOver) && "z-20 bg-action-neutral-hover",
        ),
        { size: "compact", width: "content" },
      )}
      custom={active}
      initial={false}
      onClick={() => onSelectTab(tab.id)}
      ref={sortable.setNodeRef}
      style={{
        transform: sortable.transform ? `translate3d(${sortable.transform.x}px, 0, 0)` : undefined,
        transition: sortable.transition,
      }}
      transition={tabTransition}
      type="button"
      variants={tabButtonVariants}
    >
      <SidebarTabIcon value={tab.icon} />
      <AnimatePresence initial={false}>
        {active ? (
          <motion.span
            animate="animate"
            className="overflow-hidden"
            exit="exit"
            initial="initial"
            transition={tabTransition}
            variants={tabLabelVariants}
          >
            {tab.name}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.button>
  );

  if (editing && active && activeTabSettings) {
    return (
      <Popover>
        <PopoverTrigger asChild>{button}</PopoverTrigger>
        <PopoverContent align="start" className="w-64 gap-0 overflow-hidden p-0" sideOffset={6}>
          {activeTabSettings}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {tab.name}
      </TooltipContent>
    </Tooltip>
  );
}

const tabButtonVariants = {
  initial: { gap: 0, paddingLeft: ".5rem", paddingRight: ".5rem" },
  animate: (expanded: boolean) => ({
    gap: expanded ? ".5rem" : 0,
    paddingLeft: ".5rem",
    paddingRight: ".5rem",
  }),
};

const tabLabelVariants = {
  initial: { opacity: 0, width: 0 },
  animate: { opacity: 1, width: "auto" },
  exit: { opacity: 0, width: 0 },
};

const tabTransition = {
  bounce: 0,
  delay: 0.05,
  duration: 0.45,
  type: "spring" as const,
};
