import { Toaster } from "sonner";
import { useState, type ReactNode } from "react";
import { useTable } from "@tanstack/react-table";
import {
  DataGrid,
  dataGridFeatures,
} from "../../../apps/web/src/components/ui/data-grid/data-grid";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { ZilobaseFeaturesProvider, type ZilobaseFeaturesConfig } from "@zilobase/features";
import { addDays, format, startOfDay } from "date-fns";
import { ShortcutProvider } from "../../../apps/web/src/app/shortcuts/shortcut-provider";
import {
  DatabaseViewProvider,
  type DatabaseViewProviderValue,
} from "../../../apps/web/src/sections/databases/views/state/components/database-view-context";
import { DatabaseCalendarView } from "../../../apps/web/src/sections/databases/views/calendar/components/database-calendar-view";
import { DatabaseViewSettingsMenu } from "../../../apps/web/src/sections/databases/views/settings/components/database-view-settings";
import type { DatabaseViewSettingsMenuProps } from "../../../apps/web/src/sections/databases/views/settings/lib/view-settings-contracts";
import {
  calendarScheduleToValue,
  getDatabaseLayoutSettings,
  getDatabaseChartSettings,
  getDatabaseFilterOperatorLabel,
  getDatabaseSubItemsSettings,
  type DatabaseCalendarSchedule,
  type DatabaseConditionalColorConfig,
} from "@zilobase/features/databases";
import { DatabaseTableView } from "../../../apps/web/src/sections/databases/views/table/components/database-table-view";
import { DatabaseTimelineView } from "../../../apps/web/src/sections/databases/views/timeline/components/database-timeline-view";
import { DatabasePageLink } from "../../../apps/web/src/sections/databases/interactions/components/database-page-link";
import { DatabaseCellContent } from "../../../apps/web/src/sections/databases/views/shared/components/database-cell-content";
import { DatabaseTable } from "../../../apps/web/src/sections/databases/views/table/components/database-table-shell";
import { CreateDatabaseRowButton } from "../../../apps/web/src/sections/databases/views/table/components/database-table-cell";
import { DatabaseRowDragControls } from "../../../apps/web/src/sections/databases/interactions/components/database-row-controls";
import type { DatabasePropertyValue, SortableDatabaseItem } from "@zilobase/features/databases";
import "../../../apps/web/src/styles/global.css";
import "../../../apps/web/src/styles/app.css";

const isCalendar = window.location.pathname.endsWith("/calendar.html");
const openedOptions: unknown[] = [];
const created: unknown[] = [];
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
const saves: Array<{
  rowId: string;
  propertyId: string;
  previous: DatabasePropertyValue;
  next: DatabasePropertyValue;
}> = [];
const opened: string[] = [];
const commands: unknown[] = [];
const session = {
  user: null,
  session: { id: "timeline-proof", userId: "user", expiresAt: "2099-01-01" },
};
const features = {
  queryClient,
  deployment: "timeline-proof",
  auth: { getSession: async () => session },
  apiFetch: async (_path: string, init?: RequestInit) => {
    const pageMatch = _path.match(/^\/pages\/(page-\d+)$/);
    if (pageMatch && (!init?.method || init.method === "GET")) {
      const index = Number(pageMatch[1].slice(5));
      return {
        accessLevel: "full",
        databaseIds: ["host"],
        page: {
          ...makeRow(index).page,
          workspaceId: "workspace",
          type: "pageblock",
          url: "#",
          createdAt: "2026-10-17T00:00:00.000Z",
          updatedAt: "2026-10-17T00:00:00.000Z",
        },
      };
    }
    const payload = JSON.parse(String(init?.body ?? "{}"));
    commands.push(payload);
    return { commandId: payload.commandId, result: {}, sourceVersions: { source: 2 } };
  },
} as unknown as ZilobaseFeaturesConfig;
queryClient.setQueryData(["session"], session);
const dateProperty = {
  id: "date-list",
  property: { id: "date", name: "Date", type: "date", config: {} },
};
const statusProperty = {
  id: "status-list",
  property: {
    id: "status",
    name: "Status",
    type: "status",
    config: {
      options: [
        { id: "open", name: "Open", color: "blue" },
        { id: "done", name: "Done", color: "green" },
      ],
    },
  },
};
const today = startOfDay(new Date());
const stored = (offset: number) => format(addDays(today, offset), "yyyy-MM-dd");
const comparisonData: object[] = [];
const comparisonColumns = [{ id: "name", size: 250 }];
function TableComparison({ children }: { children: ReactNode }) {
  const table = useTable({
    features: dataGridFeatures,
    columns: comparisonColumns,
    data: comparisonData,
  });
  return (
    <DataGrid table={table} recordCount={0}>
      {children}
    </DataGrid>
  );
}
function makeRow(index: number): SortableDatabaseItem {
  return {
    id: `row-${index}`,
    pageId: `page-${index}`,
    position: index,
    createdAt: "",
    updatedAt: "",
    page: {
      id: `page-${index}`,
      name:
        index === 0
          ? "A long timeline title that must stay single line even in a narrow name column"
          : `Task ${index}`,
    },
  };
}
const proof = {
  saves,
  opened,
  openedOptions,
  created,
  commands,
  setOptions: (_options: Record<string, unknown>) => {},
  setDates: (_dates: Record<string, DatabasePropertyValue>) => {},
  setStatuses: (_statuses: Record<string, string>) => {},
  setConditionalColors: (_settings: DatabaseConditionalColorConfig[]) => {},
  readConditionalColors: (): DatabaseConditionalColorConfig[] => [],
  rollback: () => {},
  readValues: (): Record<string, DatabasePropertyValue> => ({}),
  reset: () => {},
};
Object.assign(window, { timelineProof: proof });
function Proof() {
  const [conditionalColors, setConditionalColors] = useState<DatabaseConditionalColorConfig[]>([]);
  const [options, setOptions] = useState({
    editable: true,
    grouped: false,
    tablePreview: false,
    count: isCalendar ? 4 : 40,
    calendarView: "month",
    columns: isCalendar ? [] : ["date-list", "status-list"],
    showSettings: false,
    previewControls: false,
    createDelay: 0,
    failCreate: false,
    viewScope: "",
    dateEnabled: true,
    sorted: false,
    embedded: false,
    pageViewport: false,
    saveDelay: 0,
  });
  const [values, setValues] = useState<Record<string, DatabasePropertyValue>>(() =>
    Object.fromEntries(
      Array.from({ length: 1000 }, (_, index) => [
        [`page-${index}:date`, index === 1 ? "" : [stored(-1), stored(3)]],
        [`page-${index}:status`, index < 20 ? "Open" : "Done"],
      ]).flat(),
    ),
  );
  const [extraRows, setExtraRows] = useState<SortableDatabaseItem[]>([]);
  const fixtureProperties = options.previewControls
    ? [
        dateProperty,
        statusProperty,
        ...["checkbox", "button", "url"].map((type) => ({
          id: `${type}-list`,
          property: { id: type, name: type, type, config: {} },
        })),
      ]
    : [dateProperty, statusProperty];
  const rows = [
    ...Array.from({ length: options.count }, (_, index) => makeRow(index)),
    ...extraRows,
  ];
  proof.setOptions = (patch) => setOptions((current) => ({ ...current, ...patch }));
  proof.setConditionalColors = setConditionalColors;
  proof.readConditionalColors = () => conditionalColors;
  proof.setDates = (dates) =>
    setValues((current) => ({
      ...current,
      ...Object.fromEntries(
        Object.entries(dates).map(([index, value]) => [`page-${index}:date`, value]),
      ),
    }));
  proof.setStatuses = (statuses) =>
    setValues((current) => ({
      ...current,
      ...Object.fromEntries(
        Object.entries(statuses).map(([index, value]) => [`page-${index}:status`, value]),
      ),
    }));
  proof.readValues = () => values;
  proof.rollback = () => {
    const save = saves.at(-1);
    if (save)
      setValues((current) => ({
        ...current,
        [`page-${save.rowId.slice(4)}:${save.propertyId}`]: save.previous,
      }));
  };
  proof.reset = () => {
    saves.length = 0;
    opened.length = 0;
    commands.length = 0;
  };
  const addRow = (groupValue?: string) => {
    const index = 1000 + extraRows.length;
    setExtraRows((current) => [...current, makeRow(index)]);
    if (groupValue) setValues((current) => ({ ...current, [`page-${index}:status`]: groupValue }));
    return index;
  };
  const value = {
    databaseId: "source",
    hostDatabaseId: "host",
    hostDatabaseWorkspaceId: null,
    databaseConfig: {},
    editable: options.editable,
    realtimeEnabled: false,
    activeDatabaseFilters: [],
    activeDatabaseSorts: options.sorted
      ? [{ id: "sort", field: "name", direction: "ascending" }]
      : [],
    activeConditionalColors: conditionalColors.map((setting) => {
      const property = fixtureProperties.find(
        (property) => property.id === setting.filter.propertyId,
      );
      return {
        ...setting,
        filter: {
          ...setting.filter,
          label: property?.property.name ?? "Name",
          propertyType: property?.property.type ?? "text",
          operatorLabel: getDatabaseFilterOperatorLabel(setting.filter.operator),
        },
      };
    }),
    activeView: {
      id: (isCalendar ? "calendar" : "timeline") + options.viewScope,
      config: options.dateEnabled
        ? { datePropertyId: "date", calendarView: options.calendarView }
        : isCalendar
          ? { datePropertyId: "missing" }
          : {},
      type: options.tablePreview ? "table" : isCalendar ? "calendar" : "timeline",
    },
    groupProperty: options.grouped ? statusProperty : null,
    items: rows,
    sortedItems: rows,
    personOptions: [],
    properties: fixtureProperties,
    visibleProperties: fixtureProperties.filter((property) =>
      options.columns.includes(property.id),
    ),
    propertyValuesByKey: values,
    timelineDateProperties: [dateProperty],
    timelineDateProperty: options.dateEnabled ? dateProperty : null,
    calendarDateProperty: options.dateEnabled ? dateProperty : null,
    setCalendarMode: (calendarView: string) =>
      setOptions((current) => ({ ...current, calendarView })),
    addCalendarRow: async (schedule: DatabaseCalendarSchedule) => {
      const waitUntil = performance.now() + options.saveDelay;
      while (performance.now() < waitUntil) {}
      if (options.createDelay)
        await new Promise((resolve) => setTimeout(resolve, options.createDelay));
      if (options.failCreate) throw new Error("Creation failed");
      const index = addRow();
      const next = calendarScheduleToValue(schedule);
      setValues((current) => ({ ...current, [`page-${index}:date`]: next }));
      created.push({ rowId: `row-${index}`, pageId: `page-${index}`, next });
      return { rowId: `row-${index}`, pageId: `page-${index}` };
    },
    headerMenusEnabled: false,
    layoutSettings: getDatabaseLayoutSettings({}),
    subItemsSettings: getDatabaseSubItemsSettings({}),
    subItemChildRowIdsByParentId: {},
    subItemDepthByRowId: {},
    subItemParentRowIdsByRowId: {},
    getDatabasePageDragPayload: () => null,
    hasDatabasePageDragPayload: () => false,
    saveDatabaseSorts: async () => {},
    showPageIconInTitle: true,
    titlePropertyLabel: "Name",
    hasNextPage: false,
    isFetchingNextPage: false,
    addDatabaseRow: (groupValue?: string) => {
      addRow(groupValue);
    },
    addTimelineRow: (start: Date, end: Date, groupValue?: string) => {
      const index = addRow(groupValue);
      setValues((current) => ({
        ...current,
        [`page-${index}:date`]: [format(start, "yyyy-MM-dd"), format(end, "yyyy-MM-dd")],
      }));
    },
    addDraggedPageRow: (
      payload: { pageId: string; title: string },
      position: number,
      groupValue?: string,
    ) => {
      setExtraRows((current) => [
        ...current,
        {
          ...makeRow(2000 + current.length),
          pageId: payload.pageId,
          page: { id: payload.pageId, name: payload.title },
        },
      ]);
      if (groupValue)
        setValues((current) => ({ ...current, [`${payload.pageId}:status`]: groupValue }));
      commands.push({ external: payload, groupValue, position });
    },
    savePropertyValue: (
      rowId: string,
      propertyId: string,
      _type: string,
      previous: DatabasePropertyValue,
      next: DatabasePropertyValue,
    ) => {
      const waitUntil = performance.now() + options.saveDelay;
      while (performance.now() < waitUntil) {
        // Model synchronous application work before the release click arrives.
      }
      saves.push({ rowId, propertyId, previous, next });
      const row = rows.find((row) => row.id === rowId)!;
      setValues((current) => ({ ...current, [`${row.pageId}:${propertyId}`]: next }));
    },
    onOpenPage: (pageId: string, options: unknown) => {
      opened.push(pageId);
      openedOptions.push(options);
    },
    updateDatabasePropertyConfig: async () => {},
    setViewDateProperty: () => setOptions((current) => ({ ...current, dateEnabled: true })),
    setupTimelineDateProperty: () => setOptions((current) => ({ ...current, dateEnabled: true })),
    fetchNextPage: async () => {},
  } as unknown as DatabaseViewProviderValue;
  return (
    <ZilobaseFeaturesProvider value={features}>
      <ShortcutProvider>
        <Toaster />
        <nav
          aria-label="Fixture controls"
          className="flex gap-4 p-3 text-sm"
          style={options.pageViewport ? { position: "absolute", top: 0 } : undefined}
        >
          <label>
            Theme
            <select
              aria-label="Theme"
              onChange={(event) =>
                document.documentElement.setAttribute("data-theme-family", event.target.value)
              }
            >
              {["default", "warm", "midnight", "forest", "ocean", "notion"].map((theme) => (
                <option key={theme} value={theme}>
                  {theme}
                </option>
              ))}
            </select>
          </label>
          <label>
            Appearance
            <select
              aria-label="Appearance"
              onChange={(event) =>
                document.documentElement.classList.toggle("dark", event.target.value === "dark")
              }
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <button
            onClick={() => setOptions((current) => ({ ...current, grouped: !current.grouped }))}
          >
            {options.grouped ? "Remove grouping" : "Group by Status"}
          </button>
          <button
            onClick={() =>
              setOptions((current) => ({ ...current, tablePreview: !current.tablePreview }))
            }
          >
            {options.tablePreview ? "Show timeline" : "Show table"}
          </button>
        </nav>
        <div
          key={String(options.pageViewport)}
          data-editor-surface={options.embedded ? "" : undefined}
          data-page-scroll-viewport={options.pageViewport ? "" : undefined}
          style={
            options.pageViewport
              ? { height: "calc(100vh - 64px)", marginTop: 64, overflowY: "auto" }
              : undefined
          }
        >
          <div
            data-editor-page-content={options.embedded ? "narrow" : undefined}
            style={options.embedded ? { maxWidth: 900, margin: "0 auto" } : undefined}
          >
            <main
              className="tiptap-editor"
              style={
                options.embedded
                  ? { margin: "48px 0", paddingLeft: 80, paddingRight: 80 }
                  : { margin: "48px 80px", maxWidth: 1100 }
              }
            >
              <section
                data-proof="table"
                className="database-table-wrap database-block-shell"
                style={{ position: "relative", marginBottom: 24, width: 250 }}
              >
                <TableComparison>
                  <DatabaseTable
                    columnKeys={["name"]}
                    columnWidths={{ name: 250 }}
                    tableMinWidth={250}
                  >
                    <thead>
                      <tr>
                        <th>Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr data-proof="table-row">
                        <td className="database-page-cell">
                          <DatabaseCellContent>
                            <DatabasePageLink
                              editable={false}
                              pageId="page-0"
                              pageSummary={makeRow(0).page}
                            />
                          </DatabaseCellContent>
                        </td>
                      </tr>
                      <CreateDatabaseRowButton
                        columnCount={1}
                        disabled={false}
                        onClick={() => {}}
                      />
                    </tbody>
                  </DatabaseTable>
                </TableComparison>
                <DatabaseRowDragControls
                  canReorderRows
                  editable
                  draggedRowId={null}
                  hoveredRowId="row-0"
                  onDragEnd={() => {}}
                  onDragStart={() => {}}
                  onHoveredRowChange={() => {}}
                  onSelectedRowChange={() => {}}
                  rowDragTitle="Drag page"
                  selectedRowIds={new Set()}
                  rowsById={new Map([["row-0", makeRow(0)]])}
                  rowLayout={{
                    rowIds: ["row-0"],
                    centers: { "row-0": 48 },
                    heights: { "row-0": 32 },
                    dropTops: [32, 64],
                  }}
                />
              </section>
              <div
                className="database-block-shell database-block-shell-full"
                data-database-layout="timeline"
              >
                <div className="database-toolbar-section" data-proof="view-tabs">
                  <div className="database-toolbar">Timeline</div>
                </div>
                <section className="database-scroll-section" style={{ position: "relative" }}>
                  <DatabaseViewProvider value={value}>
                    {isCalendar && options.showSettings && (
                      <DatabaseViewSettingsMenu
                        {...({
                          ...value,
                          activeViewType: "calendar",
                          draftViewTitle: "Calendar",
                          dateProperties: [dateProperty],
                          datePropertyId: "date",
                          groupProperties: [statusProperty],
                          groupPropertyId: null,
                          dataSources: [],
                          addableFilterFieldOptions: [],
                          addableSortFieldOptions: [],
                          filterFieldOptions: [dateProperty, statusProperty].map((property) => ({
                            value: property.id,
                            label: property.property.name,
                          })),
                          sortFieldOptions: [],
                          filterValueOptionsByField: {
                            "status-list": ["Not started", "Open", "Done"].map((status) => ({
                              value: status,
                              label: status,
                            })),
                          },
                          onSaveDatabaseConditionalColors: setConditionalColors,
                          chartSettings: getDatabaseChartSettings({}),
                          viewConfig: {
                            hiddenPropertyIds: [dateProperty, statusProperty]
                              .filter((property) => !options.columns.includes(property.id))
                              .map((property) => property.id),
                          },
                          visiblePropertyCount: options.columns.length,
                          onTogglePropertyVisibility: (id: string) =>
                            setOptions((current) => ({
                              ...current,
                              columns: current.columns.includes(id)
                                ? current.columns.filter((column) => column !== id)
                                : [...current.columns, id],
                            })),
                        } as unknown as DatabaseViewSettingsMenuProps)}
                      />
                    )}
                    {options.tablePreview ? (
                      <DatabaseTableView />
                    ) : isCalendar ? (
                      <DatabaseCalendarView />
                    ) : (
                      <DatabaseTimelineView />
                    )}
                  </DatabaseViewProvider>
                </section>
              </div>
            </main>
          </div>
        </div>
      </ShortcutProvider>
    </ZilobaseFeaturesProvider>
  );
}
createRoot(document.getElementById("timeline-proof")!).render(<Proof />);
