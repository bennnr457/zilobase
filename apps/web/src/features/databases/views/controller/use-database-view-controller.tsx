import { createDatabaseSourceCommands } from "@zilobase/features/databases";
import { shouldUseDatabaseSetupMode } from "@/features/databases/setup/model/setup-mode";
import { useCallback, useEffect, useMemo, useState, type DragEvent as ReactDragEvent } from "react";

import { isDatabaseLocked } from "@zilobase/features/databases";
import {
  useAddDatabaseView,
  useAddDatabaseProperty,
  useAddDatabaseRow,
  useChangeDatabaseRow,
  useApplyDatabaseTemplate,
  useCreateDatabaseDataSource,
  useDatabaseBootstrap,
  useDatabaseViewData,
  useDeleteDatabaseView,
  useLinkDatabaseDataSource,
  useReplaceDatabaseViewDataSource,
  useUnlinkDatabaseDataSource,
  useUpdateDataSource,
  useUpdateDatabaseView,
  useUpdateDatabaseProperty,
  useUpdateDatabasePropertyValue,
} from "@zilobase/features/databases/react";
import { toast } from "sonner";
import { createSampleRowContent } from "../../setup/components/database-setup-card";
import { usePage } from "@zilobase/features/pages/react";
import {
  getDatabasePageDragPayload,
  hasDatabasePageDragPayload,
  type DatabasePageDragPayload,
} from "../../interactions/database-page-drop";
import type { DatabaseViewProviderValue } from "../state/database-view-context";
import { getDatabaseViewCommands } from "../../records/view-commands";
import { presentDatabaseViewModel } from "../components/database-view-model";
import { useDatabaseController } from "@zilobase/features/databases/react";
import {
  composeDatabaseViewData,
  getDatabaseDataSourceSummaries,
  getDatabaseViewTabs,
  resolveRequestedDatabaseViewId,
} from "@zilobase/features/databases";
import { getDatabaseSetupDismissed } from "@zilobase/features/databases";
import {
  databaseViewTypeOptions,
  type DatabaseViewType,
} from "../view-settings/model/view-type-options";

export type DatabaseViewProps = {
  activeViewId?: string | null;
  databaseId: string | null | undefined;
  editable?: boolean;
  fullPage?: boolean;
  includeDeleted?: boolean;
  hideWhenDeleted?: boolean;
  onDeleted?: () => void;
  onActiveViewIdChange?: (viewId: string | null) => void;
  onOpenPage?: (pageId: string, options?: { databaseId?: string | null }) => void;
  onDismissSetup?: () => void;
  onSetupComplete?: () => void;
  onShowTitleChange?: (showTitle: boolean) => void;
  workspaceId?: string | null;
  setupMode?: boolean;
  showExpandButton?: boolean;
  canRestoreDeleted?: boolean;
  showTitle?: boolean;
  pageId?: string | null;
};

export function useDatabaseViewController({
  activeViewId: requestedActiveViewId,
  databaseId,
  editable: requestedEditable = true,
  fullPage = false,
  includeDeleted = false,
  onActiveViewIdChange,
  onOpenPage,
  onDismissSetup,
  onSetupComplete,
  onShowTitleChange,
  workspaceId,
  setupMode = false,
  showExpandButton = false,
  showTitle = true,
  pageId = null,
}: DatabaseViewProps) {
  const databaseController = useDatabaseController();
  const updateDatabase = useUpdateDataSource();
  const applyDataSourceTemplate = useApplyDatabaseTemplate();
  const createDataSource = useCreateDatabaseDataSource();
  const updateDatabaseView = useUpdateDatabaseView();
  const addDatabaseView = useAddDatabaseView();
  const linkDatabaseDataSource = useLinkDatabaseDataSource();
  const replaceDatabaseViewDataSource = useReplaceDatabaseViewDataSource();
  const unlinkDatabaseDataSource = useUnlinkDatabaseDataSource();
  const deleteDatabaseView = useDeleteDatabaseView();
  const addProperty = useAddDatabaseProperty();
  const updateProperty = useUpdateDatabaseProperty();
  const addRow = useAddDatabaseRow();
  const updateValue = useUpdateDatabasePropertyValue();
  const changeRow = useChangeDatabaseRow();
  const { data: hostPage } = usePage(pageId, {
    refetchOnMount: false,
  });
  const includeDeletedDatabases = includeDeleted || Boolean(hostPage?.deletedAt);
  const bootstrapState = useDatabaseBootstrap(
    databaseId ? { databaseId, includeDeleted: includeDeletedDatabases } : null,
  );
  const bootstrap = bootstrapState.data;
  const bootstrapViewData = useMemo(
    () =>
      composeDatabaseViewData({
        bootstrap,
        dataSourceId: null,
        hasMore: false,
        records: [],
        totalCount: 0,
      }),
    [bootstrap],
  );
  const databaseDeleted = Boolean(bootstrap?.database.deletedAt);
  const editable = requestedEditable && !databaseDeleted && !isDatabaseLocked(bootstrap?.database);
  const [draftDatabaseTitle, setDraftDatabaseTitle] = useState("New database");
  const [draftViewTitle, setDraftViewTitle] = useState("Table");
  const [activeViewId, setActiveViewId] = useState<string | null>(requestedActiveViewId ?? null);
  const [showFilterPill, setShowFilterPill] = useState(true);
  const [showSortPill, setShowSortPill] = useState(true);
  const [filterPickerOpen, setFilterPickerOpen] = useState(false);
  const [sortPickerOpen, setSortPickerOpen] = useState(false);
  const [dataSourceSetupOpen, setDataSourceSetupOpen] = useState(false);
  const isControlledActiveView = Boolean(onActiveViewIdChange);
  const dataSources = useMemo(
    () =>
      getDatabaseDataSourceSummaries(
        bootstrapViewData?.bootstrap.dataSources,
        bootstrapViewData?.bootstrap.views,
      ),
    [bootstrapViewData],
  );
  const baseViewTabs = useMemo(
    () =>
      getDatabaseViewTabs(
        bootstrapViewData?.bootstrap.dataSources,
        bootstrapViewData?.bootstrap.views,
      ),
    [bootstrapViewData],
  );
  const requestedViewId = resolveRequestedDatabaseViewId({
    requestedViewId: requestedActiveViewId,
    viewTabs: baseViewTabs,
  });
  const resolvedActiveViewId = isControlledActiveView
    ? (requestedViewId ?? baseViewTabs[0]?.id ?? null)
    : activeViewId;
  const {
    activeDataSourceId,
    recordWindow,
    viewData,
    activeProperties,
    model,
    prefetchDatabaseView,
  } = useDatabaseViewData({
    databaseId,
    bootstrap,
    serverBootstrap: bootstrapState.serverData,
    activeViewId: resolvedActiveViewId,
    includeDeleted: includeDeletedDatabases,
  });
  const setupDismissed = getDatabaseSetupDismissed(viewData?.activeDataSource?.config);
  const hasSetupContent = Boolean(
    viewData &&
    (activeProperties.length > 0 ||
      viewData.totalCount > 0 ||
      viewData.bootstrap.dataSources.length > 1),
  );
  const effectiveSetupMode = shouldUseDatabaseSetupMode({
    // Emptiness is only knowable after load: unloaded and placeholder states
    // always compute hasContent === false, so the setup dialog must wait for
    // this hash's real result. Background refetches keep settled data (not
    // placeholder), so an already-correct dialog never flickers.
    dataSettled:
      bootstrapState.status === "success" &&
      recordWindow.status === "success" &&
      !recordWindow.isPlaceholderData,
    editable,
    hasContent: hasSetupContent,
    setupDismissed,
    setupMode,
  });
  const activeViewData = viewData;
  const activeDatabaseId = activeViewData?.activeDataSource?.id ?? null;
  const viewTabs = baseViewTabs;
  const activeFetchNextPage = recordWindow.fetchNextPage;
  const activeHasNextPage = recordWindow.hasMore;
  const activeIsFetchingNextPage = recordWindow.isFetchingNextPage;
  const activeViewTabId = resolvedActiveViewId;
  const setSelectedActiveViewId = useCallback<DatabaseViewProviderValue["setActiveViewId"]>(
    (value) => {
      if (isControlledActiveView) {
        const nextViewId = typeof value === "function" ? value(resolvedActiveViewId) : value;
        if (nextViewId !== resolvedActiveViewId) onActiveViewIdChange?.(nextViewId);
        return;
      }
      setActiveViewId((currentViewId) => {
        return typeof value === "function" ? value(currentViewId) : value;
      });
    },
    [isControlledActiveView, onActiveViewIdChange, resolvedActiveViewId],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !bootstrap || recordWindow.status !== "success") {
      return;
    }
    const pending = bootstrap.views
      .filter(
        (view) => view.id !== resolvedActiveViewId && view.dataSourceId === activeDataSourceId,
      )
      .slice(0, 3);
    if (pending.length === 0) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      for (const view of pending) prefetchDatabaseView(view.id);
    };
    let idleHandle: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(() => run(), { timeout: 1_200 });
    } else {
      timer = globalThis.setTimeout(run, 400);
    }
    return () => {
      cancelled = true;
      if (idleHandle !== null) window.cancelIdleCallback(idleHandle);
      if (timer !== null) globalThis.clearTimeout(timer);
    };
  }, [
    activeDataSourceId,
    bootstrap,
    prefetchDatabaseView,
    recordWindow.status,
    resolvedActiveViewId,
  ]);

  const viewModel = useMemo(() => presentDatabaseViewModel(model), [model]);
  const {
    activeConditionalColors,
    activeDatabaseFilters,
    activeDatabaseSorts,
    activeView,
    activeVisibilityConfig,
    addableFilterFieldOptions,
    addableSortFieldOptions,
    canAddDatabaseFilter,
    canAddDatabaseSort,
    chartSettings,
    filterFieldOptions,
    filterValueOptionsByField,
    filteredItems,
    groupOptions,
    groupProperty,
    groupableProperties,
    isKanbanView,
    isTimelineView,
    items,
    kanbanGroupProperty,
    kanbanOptions,
    layoutSettings,
    timelineDateProperties,
    timelineDateProperty,
    personOptions,
    properties,
    propertyValuesByKey,
    showPageIconInTitle,
    showPropertyTitles,
    sortFieldOptions,
    sortedItems,
    subItemChildRowIdsByParentId,
    subItemDepthByRowId,
    subItemParentRowIdsByRowId,
    subItemsSettings,
    titlePropertyLabel,
    visibleProperties,
    visiblePropertyCount,
  } = viewModel;
  useEffect(() => {
    const nextDatabaseTitle = activeViewData?.activeDataSource?.name;

    if (nextDatabaseTitle) {
      setDraftDatabaseTitle(nextDatabaseTitle);
    }
  }, [activeViewData?.activeDataSource?.name]);

  useEffect(() => {
    if (isControlledActiveView) {
      return;
    }

    if (viewTabs.length === 0) {
      setActiveViewId(null);
      return;
    }

    setActiveViewId((currentViewId) => {
      return currentViewId && viewTabs.some((view) => view.id === currentViewId)
        ? currentViewId
        : (viewTabs[0]?.id ?? null);
    });
  }, [isControlledActiveView, viewTabs]);

  useEffect(() => {
    const nextViewTitle = activeView?.name;

    if (nextViewTitle) {
      setDraftViewTitle(nextViewTitle);
    }
  }, [activeView?.id, activeView?.name]);

  useEffect(() => {
    if (activeDatabaseSorts.length === 0) {
      setShowSortPill(false);
    }
  }, [activeDatabaseSorts.length]);

  useEffect(() => {
    if (activeDatabaseFilters.length === 0) {
      setShowFilterPill(false);
    }
  }, [activeDatabaseFilters.length]);

  const getLatestViewConfig = useCallback(
    (nextDatabaseId: string, databaseViewId: string, fallbackConfig: unknown) => {
      return (
        databaseController.bootstrap(nextDatabaseId)?.views.find(({ id }) => id === databaseViewId)
          ?.config ?? fallbackConfig
      );
    },
    [databaseController],
  );

  const getSourcePropertyMode = useCallback(async (_dragPayload: DatabasePageDragPayload) => {
    return "match" as const;
  }, []);

  const sourceCommands = createDatabaseSourceCommands({
    databaseId,
    editable,
    bootstrap,
    resolvedActiveViewId,
    activeViewTabId,
    viewTabs,
    updateDatabase,
    applyDataSourceTemplate,
    createDataSource,
    updateDatabaseView,
    addDatabaseView,
    linkDatabaseDataSource,
    replaceDatabaseViewDataSource,
    unlinkDatabaseDataSource,
    deleteDatabaseView,
    onViewSelected: setSelectedActiveViewId,
    notify: toast,
    createSampleRowContent,
  });
  const {
    linkDataSourceView,
    unlinkDataSource,
    replaceActiveViewSource,
    handleDataSourceSetupSelection,
    saveDatabaseViewIcon,
    duplicateDatabaseView,
    deleteDatabaseViewByTab,
  } = sourceCommands;
  const addDataSourceView = (
    dataSourceId: string,
    type: DatabaseViewType,
    mode: "add" | "replace" = "add",
  ) =>
    sourceCommands.addDataSourceView(
      dataSourceId,
      type,
      databaseViewTypeOptions.find((option) => option.type === type)?.label ?? "Table",
      mode,
    );

  const commands = getDatabaseViewCommands({
    notify: toast,
    copyViewLink: (id) =>
      typeof window === "undefined"
        ? undefined
        : navigator.clipboard.writeText(`${window.location.origin}/d/${id}`),
    activeDatabaseFilters,
    activeDatabaseSorts,
    activeView,
    databaseId: activeDatabaseId,
    viewDatabaseId: databaseId,
    editable,
    isKanbanView,
    items,
    kanbanGroupProperty,
    timelineDateProperty,
    mutations: {
      addDatabaseView,
      addProperty,
      addRow,
      updateDatabase,
      updateDatabaseView,
      changeRow,
      updateProperty,
      updateValue,
    },
    viewData: activeViewData,
    properties,
    setActiveViewId: setSelectedActiveViewId,
    setFilterPickerOpen,
    setShowFilterPill,
    setShowSortPill,
    setSortPickerOpen,
    getLatestViewConfig,
    getSourcePropertyMode,
  });

  const handleDatabaseBlockDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!editable || !hasDatabasePageDragPayload(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDatabaseBlockDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!editable) {
      return;
    }

    const dragPayload = getDatabasePageDragPayload(event.dataTransfer);

    if (!dragPayload) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    commands.addDraggedPageRow(dragPayload, items.length);
  };

  const databaseViewContext: DatabaseViewProviderValue = {
    activeConditionalColors,
    activeDatabaseFilters,
    activeDatabaseSorts,
    activeView,
    activeViewTabId,
    activeVisibilityConfig,
    addDataSource: () => setDataSourceSetupOpen(true),
    addableFilterFieldOptions,
    addableSortFieldOptions,
    addDatabaseProperty: commands.addDatabaseProperty,
    addChartView: commands.addChartView,
    addFormView: commands.addFormView,
    addGalleryView: commands.addGalleryView,
    addDraggedPageRow: commands.addDraggedPageRow,
    addKanbanView: commands.addKanbanView,
    addListView: commands.addListView,
    linkDataSourceView,
    unlinkDataSource,
    addDataSourceView,
    replaceActiveViewSource,
    addDatabaseRow: commands.addDatabaseRow,
    addTableView: commands.addTableView,
    addTimelineRow: commands.addTimelineRow,
    addTimelineView: commands.addTimelineView,
    canAddDatabaseFilter,
    canAddDatabaseProperties: true,
    canAddDatabaseRows: true,
    canAddDatabaseViews: editable,
    canAddDatabaseSort,
    chartSettings,
    propertyValuesByKey,
    clearDatabaseFilter: commands.clearDatabaseFilter,
    clearDatabaseSort: commands.clearDatabaseSort,
    copyDatabaseViewLink: commands.copyDatabaseViewLink,
    createDatabaseFilter: commands.createDatabaseFilter,
    createDatabaseSort: commands.createDatabaseSort,
    dataSources,
    databaseConfig: activeViewData?.activeDataSource?.config,
    databaseId: activeDatabaseId,
    databaseName: activeViewData?.activeDataSource?.name,
    databasePageId: activeViewData?.bootstrap.database.pageId,
    databaseWorkspaceId: activeViewData?.bootstrap.database.workspaceId,
    deleteDatabaseView: deleteDatabaseViewByTab,
    duplicateDatabaseView,
    draftDatabaseTitle,
    draftViewTitle,
    editable,
    fetchNextPage: activeFetchNextPage,
    filterFieldOptions,
    filterPickerOpen,
    filterValueOptionsByField,
    filteredItems,
    fullPage,
    getDatabasePageDragPayload,
    groupOptions,
    groupProperty,
    groupableProperties,
    hasDatabasePageDragPayload,
    hasNextPage: activeHasNextPage,
    headerMenusEnabled: editable,
    hostDatabaseId: bootstrap?.database.id ?? databaseId,
    hostDatabaseName: bootstrap?.database.name,
    hostDatabaseWorkspaceId: bootstrap?.database.workspaceId,
    realtimeEnabled: Boolean(bootstrap) && !databaseDeleted,
    hostViews: bootstrap?.views ?? [],
    isAddingDatabaseProperty: addProperty.isPending,
    isAddingDatabaseRow: addRow.isPending,
    isAddingDataSource:
      createDataSource.isPending ||
      applyDataSourceTemplate.isPending ||
      linkDatabaseDataSource.isPending,
    isAddingDatabaseView: addDatabaseView.isPending || replaceDatabaseViewDataSource.isPending,
    isTimelineView,
    isFetchingNextPage: activeIsFetchingNextPage,
    layoutSettings,
    titlePropertyLabel,
    showPageIconInTitle,
    onOpenPage,
    options: kanbanOptions,
    workspaceId: bootstrap?.database.workspaceId ?? workspaceId,
    personOptions,
    prefetchDatabaseView,
    properties,
    removeDatabaseFilter: commands.removeDatabaseFilter,
    removeDatabaseSort: commands.removeDatabaseSort,
    renameDatabaseProperty: commands.renameDatabaseProperty,
    reorderDatabaseFilters: commands.reorderDatabaseFilters,
    items,
    savePropertyValue: commands.savePropertyValue,
    saveDatabaseEmoji: commands.saveDatabaseEmoji,
    saveDatabaseTitle: commands.saveDatabaseTitle,
    saveDatabaseViewIcon,
    saveDatabaseConditionalColors: commands.saveDatabaseConditionalColors,
    saveDatabaseFilters: commands.saveDatabaseFilters,
    saveDatabasePropertyOrder: commands.saveDatabasePropertyOrder,
    saveDatabaseSorts: commands.saveDatabaseSorts,
    saveDatabaseViewTitle: commands.saveDatabaseViewTitle,
    setActiveViewId: setSelectedActiveViewId,
    setDraftDatabaseTitle,
    setDraftViewTitle,
    setFilterPickerOpen,
    setViewDateProperty: commands.setViewDateProperty,
    setupTimelineDateProperty: commands.setupTimelineDateProperty,
    setViewGroupProperty: commands.setViewGroupProperty,
    setViewType: commands.setViewType,
    timelineDateProperties,
    timelineDateProperty,
    setSortPickerOpen,
    showExpandButton,
    showFilterPill,
    showSortPill,
    showPropertyTitles,
    showTitle,
    onShowTitleChange,
    sortFieldOptions,
    sortPickerOpen,
    sortedItems,
    subItemChildRowIdsByParentId,
    subItemDepthByRowId,
    subItemParentRowIdsByRowId,
    subItemsSettings,
    togglePropertyVisibility: commands.togglePropertyVisibility,
    toggleFilterPillVisibility: commands.toggleFilterPillVisibility,
    togglePropertyTitles: commands.togglePropertyTitles,
    toggleSortPillVisibility: commands.toggleSortPillVisibility,
    updateDatabasePropertyConfig: commands.updateDatabasePropertyConfig,
    updateDatabaseChartSettings: commands.updateDatabaseChartSettings,
    updateDatabaseLayoutSettings: commands.updateDatabaseLayoutSettings,
    updateDatabaseFilter: commands.updateDatabaseFilter,
    updateDatabaseFormHeaderSettings: commands.updateDatabaseFormHeaderSettings,
    updateDatabaseFormQuestionSettings: commands.updateDatabaseFormQuestionSettings,
    updateDatabaseFormShareSettings: commands.updateDatabaseFormShareSettings,
    updateNameColumnConfig: commands.updateNameColumnConfig,
    updateDatabaseSort: commands.updateDatabaseSort,
    updateDatabaseSubItemsSettings: commands.updateDatabaseSubItemsSettings,
    visibleProperties,
    visiblePropertyCount,
    viewTabs,
    views: activeViewData?.bootstrap.views ?? [],
  };

  return {
    className: fullPage ? "database-block-shell database-block-shell-full" : "database-block-shell",
    context: databaseViewContext,
    dataSourceSetupOpen,
    databaseDeleted,
    databaseId,
    error: recordWindow.error ?? bootstrapState.error,
    isError: recordWindow.status === "error" || bootstrapState.status === "error",
    handleDatabaseBlockDragOver,
    handleDatabaseBlockDrop,
    isLoading:
      Boolean(databaseId) &&
      (bootstrapState.status === "idle" ||
        bootstrapState.status === "loading" ||
        (Boolean(resolvedActiveViewId && activeDataSourceId) &&
          (recordWindow.status === "idle" || recordWindow.status === "loading"))),
    onDismissSetup,
    onDataSourceSetupClose: () => setDataSourceSetupOpen(false),
    onDataSourceSetupSelect: handleDataSourceSetupSelection,
    onSetupComplete,
    workspaceId: bootstrap?.database.workspaceId ?? workspaceId,
    viewData: activeViewData,
    sourcePropertyDialog: null,
    setupMode: effectiveSetupMode,
    viewType: activeView?.type,
    pageId,
  };
}
