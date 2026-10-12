import type { DatabaseBootstrapResponse } from "../core/entities";
import { diffConfiguration } from "../interactions/configuration";
import { getMergedDatabaseConfig } from "../views/configuration";
import { databaseCsvPayload, databaseTemplateRows } from "../templates/payload";
import { getDatabaseSetupTemplate, type DatabaseSetupTemplateId } from "../templates/definitions";
import type {
  useUpdateDataSource,
  useApplyDatabaseTemplate,
  useCreateDatabaseDataSource,
  useUpdateDatabaseView,
  useAddDatabaseView,
  useLinkDatabaseDataSource,
  useReplaceDatabaseViewDataSource,
  useUnlinkDatabaseDataSource,
  useDeleteDatabaseView,
} from "../react";
export type DatabaseViewType =
  | "table"
  | "kanban"
  | "timeline"
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
  onViewSelected,
  notify,
  createSampleRowContent,
}: {
  databaseId: string | null | undefined;
  editable: boolean;
  bootstrap: DatabaseBootstrapResponse | undefined;
  resolvedActiveViewId: string | null;
  activeViewTabId: string | null;
  viewTabs: { id: string }[];
  updateDatabase: ReturnType<typeof useUpdateDataSource>;
  applyDataSourceTemplate: ReturnType<typeof useApplyDatabaseTemplate>;
  createDataSource: ReturnType<typeof useCreateDatabaseDataSource>;
  updateDatabaseView: ReturnType<typeof useUpdateDatabaseView>;
  addDatabaseView: ReturnType<typeof useAddDatabaseView>;
  linkDatabaseDataSource: ReturnType<typeof useLinkDatabaseDataSource>;
  replaceDatabaseViewDataSource: ReturnType<typeof useReplaceDatabaseViewDataSource>;
  unlinkDatabaseDataSource: ReturnType<typeof useUnlinkDatabaseDataSource>;
  deleteDatabaseView: ReturnType<typeof useDeleteDatabaseView>;
  onViewSelected: (id: string | null) => void;
  notify: { success: (message: string) => void; error: (message: string) => void };
  createSampleRowContent: (markdown: string) => unknown;
}) {
  const linkDataSourceView = (selection: DatabaseSourceViewSelection) => {
    if (!databaseId || linkDatabaseDataSource.isPending) return;
    linkDatabaseDataSource.mutate(
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
      unlinkDatabaseDataSource.isPending ||
      deleteDatabaseView.isPending
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
        await deleteDatabaseView.mutateAsync({ databaseId, databaseViewId });
      }
      await unlinkDatabaseDataSource.mutateAsync({ databaseId, dataSourceId });
      onViewSelected(fallbackViewId);
      notify.success("Linked data source removed.");
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not remove the linked data source.",
      );
    }
  };

  const replaceActiveViewSource = async (selection: DatabaseSourceViewSelection) => {
    if (
      !databaseId ||
      !resolvedActiveViewId ||
      !editable ||
      replaceDatabaseViewDataSource.isPending
    )
      return;

    await replaceDatabaseViewDataSource.mutateAsync({
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
      linkDatabaseDataSource.isPending ||
      replaceDatabaseViewDataSource.isPending
    ) {
      return;
    }

    try {
      if (mode === "replace") {
        if (!resolvedActiveViewId) return;
        await replaceDatabaseViewDataSource.mutateAsync({
          databaseId,
          databaseViewId: resolvedActiveViewId,
          dataSourceId,
        });
        notify.success("View source replaced.");
        return;
      }
      const { view } = await linkDatabaseDataSource.mutateAsync({
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
    if (!editable || !databaseId || createDataSource.isPending || updateDatabase.isPending) {
      return;
    }

    try {
      if (selection.sourceView) {
        const { view } = await linkDatabaseDataSource.mutateAsync({
          databaseId,
          config: selection.sourceView.viewConfig,
          dataSourceId: selection.sourceView.dataSourceId,
          name: selection.sourceView.viewName,
          type: selection.sourceView.viewType,
        });
        onViewSelected(view.id);
        notify.success("Data source linked.");
        return;
      }

      const template = selection.templateId ? getDatabaseSetupTemplate(selection.templateId) : null;
      const databaseName =
        selection.databaseName || selection.csvImport?.name || template?.name || "New data source";
      const created = await createDataSource.mutateAsync({
        databaseId,
        name: databaseName,
      });
      const createdSource = created.dataSource;
      if (selection.csvImport) {
        await applyDataSourceTemplate.mutateAsync({
          config: getMergedDatabaseConfig(createdSource.config, {
            setupDismissed: true,
          }),
          databaseId: createdSource.id,
          name: databaseName,
          ...databaseCsvPayload(selection.csvImport),
        });
      } else if (template) {
        const propertyTypesByName = new Map(
          template.properties.map((property) => [property.name.toLowerCase(), property.type]),
        );

        await applyDataSourceTemplate.mutateAsync({
          config: getMergedDatabaseConfig(createdSource.config, {
            emoji: template.emoji,
            setupDismissed: true,
          }),
          databaseId: createdSource.id,
          name: databaseName,
          properties: template.properties,
          rows: databaseTemplateRows(
            template,
            propertyTypesByName,
            createSampleRowContent,
            (emoji) => ({ emoji }),
          ),
        });
      }

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

    updateDatabaseView.mutate({
      configuration: diffConfiguration(
        sourceView.config,
        getMergedDatabaseConfig(sourceView.config, { icon: nextIcon }),
      ),
      databaseId,
      databaseViewId: sourceView.id,
    });
  };

  const duplicateDatabaseView = (view: { id: string }) => {
    if (!databaseId || addDatabaseView.isPending || updateDatabase.isPending) {
      return;
    }

    const sourceView = (bootstrap?.views ?? []).find((databaseView) => databaseView.id === view.id);

    if (!sourceView) {
      return;
    }

    addDatabaseView.mutate(
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
    if (!databaseId || deleteDatabaseView.isPending) {
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

    deleteDatabaseView.mutate(
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
