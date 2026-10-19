import type { ClientOperationContext } from "../../shared/operation-context";
import type { DatabaseBootstrapResponse } from "../core/entities";
import { diffConfiguration } from "../interactions/configuration";
import { type DatabaseSetupTemplateId } from "../templates/definitions";
import { getMergedDatabaseConfig } from "../views/configuration";
import { observeOperation } from "./mutation-bindings";
import { setupDatabaseSource } from "./source-workflows";
type SourceOperations = typeof import("../mutations/data-sources-operations");
type ViewOperations = typeof import("../mutations/views-operations");
type PropertyOperations = typeof import("../mutations/properties-operations");
type Callback<T extends (...args: never[]) => unknown> = (input: Parameters<T>[1]) => ReturnType<T>;
export type DatabaseViewType =
  | "table"
  | "kanban"
  | "timeline"
  | "calendar"
  | "list"
  | "gallery"
  | "chart"
  | "form";
export type DatabaseSourceViewSelection = {
  dataSourceId: string;
  dataSourceName: string;
  parentDatabaseId: string;
  viewConfig?: unknown;
  viewIcon?: string;
  viewId: string;
  viewName: string;
  viewType: string;
};
export type DatabaseSetupSelection = {
  csvImport?: { headers: string[]; name: string; rows: string[][] };
  databaseName?: string;
  sourceView?: DatabaseSourceViewSelection;
  templateId?: DatabaseSetupTemplateId | null;
};
export function createDatabaseSourceCommands({
  context,
  pending = {},
  databaseId,
  editable,
  bootstrap,
  resolvedActiveViewId,
  activeViewTabId,
  viewTabs,
  updateDatabaseView,
  addDatabaseView,
  linkDatabaseDataSource,
  replaceDatabaseViewDataSource,
  unlinkDatabaseDataSource,
  deleteDatabaseView,
  onViewSelected,
  notify,
  createSampleRowContent,
}: {
  context: ClientOperationContext;
  pending?: Partial<
    Record<
      | "updateDatabase"
      | "applyDataSourceTemplate"
      | "createDataSource"
      | "updateDatabaseView"
      | "addDatabaseView"
      | "linkDatabaseDataSource"
      | "replaceDatabaseViewDataSource"
      | "unlinkDatabaseDataSource"
      | "deleteDatabaseView",
      boolean
    >
  >;
  databaseId: string | null | undefined;
  editable: boolean;
  bootstrap: DatabaseBootstrapResponse | undefined;
  resolvedActiveViewId: string | null;
  activeViewTabId: string | null;
  viewTabs: { id: string }[];
  updateDatabase: Callback<SourceOperations["updateDataSource"]>;
  applyDataSourceTemplate: Callback<PropertyOperations["applyDatabaseTemplate"]>;
  createDataSource: Callback<SourceOperations["createDatabaseDataSource"]>;
  updateDatabaseView: Callback<ViewOperations["updateDatabaseView"]>;
  addDatabaseView: Callback<ViewOperations["addDatabaseView"]>;
  linkDatabaseDataSource: Callback<SourceOperations["linkDatabaseDataSource"]>;
  replaceDatabaseViewDataSource: Callback<SourceOperations["replaceDatabaseViewDataSource"]>;
  unlinkDatabaseDataSource: Callback<SourceOperations["unlinkDatabaseDataSource"]>;
  deleteDatabaseView: Callback<ViewOperations["deleteDatabaseView"]>;
  onViewSelected: (id: string | null) => void;
  notify: { success: (message: string) => void; error: (message: string) => void };
  createSampleRowContent: (markdown: string) => unknown;
}) {
  const linkDataSourceView = (selection: DatabaseSourceViewSelection) => {
    if (!databaseId || pending.linkDatabaseDataSource) return;
    observeOperation(
      linkDatabaseDataSource,
      {
        databaseId,
        config: selection.viewConfig,
        dataSourceId: selection.dataSourceId,
        name: selection.viewName,
        type: selection.viewType,
      },
      {
        onSuccess: ({ view }) => {
          onViewSelected(view.id);
          notify.success("Data source linked.");
        },
      },
    );
  };

  const unlinkDataSource = async (dataSourceId: string) => {
    if (
      !databaseId ||
      !editable ||
      pending.unlinkDatabaseDataSource ||
      pending.deleteDatabaseView
    ) {
      return;
    }

    const source = bootstrap?.dataSources.find((candidate) => candidate.id === dataSourceId);
    if (!source || source.parentDatabaseId === databaseId) return;

    const sourceViewIds =
      bootstrap?.views
        .filter((view) => view.dataSourceId === dataSourceId)
        .map((view) => view.id) ?? [];
    const fallbackViewId =
      bootstrap?.views.find((view) => view.dataSourceId !== dataSourceId)?.id ?? null;

    try {
      for (const databaseViewId of sourceViewIds) {
        await deleteDatabaseView({ databaseId, databaseViewId });
      }
      await unlinkDatabaseDataSource({ databaseId, dataSourceId });
      onViewSelected(fallbackViewId);
      notify.success("Linked data source removed.");
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not remove the linked data source.",
      );
    }
  };

  const replaceActiveViewSource = async (selection: DatabaseSourceViewSelection) => {
    if (!databaseId || !resolvedActiveViewId || !editable || pending.replaceDatabaseViewDataSource)
      return;

    await replaceDatabaseViewDataSource({
      databaseId,
      databaseViewId: resolvedActiveViewId,
      dataSourceId: selection.dataSourceId,
    });
    onViewSelected(resolvedActiveViewId);
    notify.success("View source replaced.");
  };

  const addDataSourceView = async (
    dataSourceId: string,
    type: DatabaseViewType,
    viewName: string,
    mode: "add" | "replace" = "add",
  ) => {
    if (
      !databaseId ||
      !editable ||
      pending.linkDatabaseDataSource ||
      pending.replaceDatabaseViewDataSource
    ) {
      return;
    }

    try {
      if (mode === "replace") {
        if (!resolvedActiveViewId) return;
        await replaceDatabaseViewDataSource({
          databaseId,
          databaseViewId: resolvedActiveViewId,
          dataSourceId,
        });
        notify.success("View source replaced.");
        return;
      }
      const { view } = await linkDatabaseDataSource({
        databaseId,
        dataSourceId,
        name: viewName,
        type,
      });
      onViewSelected(view.id);
      notify.success(`${viewName} view added.`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not add the view.");
    }
  };

  const handleDataSourceSetupSelection = async (selection: DatabaseSetupSelection) => {
    if (!editable || !databaseId || pending.createDataSource || pending.updateDatabase) {
      return;
    }

    try {
      const created = await setupDatabaseSource(context, {
        databaseId,
        selection,
        createSampleRowContent,
      });
      onViewSelected(created.view.id);
      notify.success("Data source added.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not add the data source.");
    }
  };

  const saveDatabaseViewIcon: (view: { id: string }, nextIcon: string) => void = (
    view,
    nextIcon,
  ) => {
    if (!editable || !databaseId) {
      return;
    }

    const sourceView = bootstrap?.views.find((candidate) => candidate.id === view.id);

    if (!sourceView) {
      return;
    }

    observeOperation(updateDatabaseView, {
      configuration: diffConfiguration(
        sourceView.config,
        getMergedDatabaseConfig(sourceView.config, { icon: nextIcon }),
      ),
      databaseId,
      databaseViewId: sourceView.id,
    });
  };

  const duplicateDatabaseView = (view: { id: string }) => {
    if (!databaseId || pending.addDatabaseView || pending.updateDatabase) {
      return;
    }

    const sourceView = (bootstrap?.views ?? []).find((databaseView) => databaseView.id === view.id);

    if (!sourceView) {
      return;
    }

    observeOperation(
      addDatabaseView,
      {
        config: sourceView.config,
        databaseId,
        dataSourceId: sourceView.dataSourceId,
        name: `${sourceView.name} copy`,
        type: sourceView.type,
      },
      {
        onSuccess: (view) => {
          onViewSelected(view.id);
        },
      },
    );
  };

  const deleteDatabaseViewByTab = (view: { id: string }) => {
    if (!databaseId || pending.deleteDatabaseView) {
      return;
    }

    if (viewTabs.length <= 1) {
      notify.error("A database must always have at least one view.");
      return;
    }

    const nextActiveViewId =
      activeViewTabId === view.id
        ? (viewTabs.find((viewTab) => viewTab.id !== view.id)?.id ?? null)
        : activeViewTabId;

    observeOperation(
      deleteDatabaseView,
      {
        databaseId,
        databaseViewId: view.id,
      },
      {
        onSuccess: () => onViewSelected(nextActiveViewId),
      },
    );
  };

  return {
    linkDataSourceView,
    unlinkDataSource,
    replaceActiveViewSource,
    addDataSourceView,
    handleDataSourceSetupSelection,
    saveDatabaseViewIcon,
    duplicateDatabaseView,
    deleteDatabaseViewByTab,
  };
}
