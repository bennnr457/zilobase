import {
  ArrowUpRight,
  CalendarRange,
  ChartPie,
  FileText,
  GalleryThumbnails,
  Kanban,
  List,
  Table2,
  Trash2,
} from "@/components/icons";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/app-tabs";
import { LinkedDataSourcePicker } from "@/sections/databases/views/shared/components/linked-data-source-picker";
import type { PageLayoutConfig, PageLayoutLinkedTab } from "@zilobase/features/pages";

type PageDesignTabsProps = {
  config: PageLayoutConfig;
  onChange?: (config: PageLayoutConfig) => void;
  onValueChange: (tabId: string) => void;
  value: string;
};

export function PageDesignTabs({ config, onChange, onValueChange, value }: PageDesignTabsProps) {
  const addLinkedTab = (tab: PageLayoutLinkedTab) => {
    if (onChange && !config.linkedTabs.some((item) => item.id === tab.id)) {
      onChange({ ...config, linkedTabs: [...config.linkedTabs, tab] });
    }
    onValueChange(tab.id);
  };

  const removeActiveTab = () => {
    if (!onChange || value === "content") return;
    onChange({
      ...config,
      linkedTabs: config.linkedTabs.filter((tab) => tab.id !== value),
    });
    onValueChange("content");
  };

  return (
    <div className="shrink-0 py-2">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        <Tabs className="min-w-0" onValueChange={onValueChange} value={value}>
          <TabsList overflow="scroll">
            <TabsTrigger value="content" width="content">
              <FileText />
              <span>Content</span>
            </TabsTrigger>
            {config.linkedTabs.map((tab) => {
              const ViewIcon =
                tab.viewType === "kanban"
                  ? Kanban
                  : tab.viewType === "timeline"
                    ? CalendarRange
                    : tab.viewType === "chart"
                      ? ChartPie
                      : tab.viewType === "gallery"
                        ? GalleryThumbnails
                        : tab.viewType === "list"
                          ? List
                          : Table2;

              return (
                <TabsTrigger key={tab.id} value={tab.id} width="content">
                  <ViewIcon />
                  <span className="truncate">{tab.viewName}</span>
                  <ArrowUpRight className="size-3 text-content-secondary" />
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        {onChange ? (
          <>
            <LinkedDataSourcePicker menuFirst onSelect={addLinkedTab} />
            {value !== "content" ? (
              <Button
                aria-label="Remove linked data source tab"
                onClick={removeActiveTab}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2 />
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
