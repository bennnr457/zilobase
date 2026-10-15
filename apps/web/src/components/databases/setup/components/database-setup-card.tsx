import { createSampleRowContent } from "@zilobase/features/databases";
export { createSampleRowContent } from "@zilobase/features/databases";
import { parseCsv } from "@zilobase/features/databases";
import { diffConfiguration } from "@zilobase/features/databases";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarRange,
  Check,
  ChevronLeft,
  CircleDashed,
  Database,
  FileText,
  Loader2,
  MoreHorizontal,
  Plus,
  Sparkles,
  X,
} from "@/components/icons";
import { toast } from "sonner";

import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai/elements/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getIconSolidClassName } from "@/lib/color-tokens";
import { DEFAULT_DATABASE_ITEM_ICON } from "@/components/navigation/navigation-icons";
import { getDatabaseIconNode, PageIconDisplay } from "@/components/pages/appearance/page-icon";
import { cn } from "@/lib/utils";
import posthog from "@/lib/posthog";
import {
  useApplyDatabaseTemplate,
  useLinkDatabaseDataSource,
  useUpdateDataSource,
} from "@zilobase/features/databases/react";
import { useDatabaseMetadata } from "@zilobase/features/databases/react";
import { usePageNavigation } from "@zilobase/features/pages/react";

import {
  getDatabaseSetupTemplate,
  inferDatabaseSetupTemplateId,
  databaseSetupMoreTemplates,
  databaseSetupSuggestedTemplates,
  type DatabaseSetupTemplate,
} from "@zilobase/features/databases";
import {
  getDatabaseSetupDismissed,
  getDatabaseViewIcon,
  getMergedDatabaseConfig,
} from "@zilobase/features/databases";
import type { DatabaseSourceViewSelection } from "../../views/state/database-view-context";
import { ViewTypeOptionGrid } from "../../views/view-settings/view-type-option-grid";
import {
  getDatabaseViewTypePresentation,
  type DatabaseViewType,
} from "../../views/view-settings/view-type-options";
import { databaseCsvPayload, databaseTemplateRows } from "@zilobase/features/databases";
import { PageDatabasePicker } from "../../page-database-picker";

type SetupView = "main" | "link";

function captureDatabaseSetupCompleted(selection: DatabaseSetupSelection) {
  posthog?.capture("database_setup_completed", {
    setup_method: selection.sourceView
      ? "linked_data_source"
      : selection.csvImport
        ? "csv_import"
        : selection.templateId
          ? "template"
          : "guided",
  });
}

type DatabaseSetupCardProps = {
  databaseId: string;
  excludedDatabaseIds?: string[];
  onComplete: () => void;
  onDismiss: () => void;
  onSelectDataSource?: (selection: DatabaseSetupSelection) => Promise<void>;
  workspaceId?: string | null;
  pageId?: string | null;
};

import type { DatabaseSetupSelection } from "@zilobase/features/databases";
export type { DatabaseSetupSelection } from "@zilobase/features/databases";

function getPageMetadataWithEmoji(metadata: unknown, emoji: string) {
  return {
    ...(metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}),
    emoji,
  };
}

function SetupSectionLabel({ children }: { children: ReactNode }) {
  return <div className="database-setup-section-label">{children}</div>;
}

function SetupOptionButton({
  children,
  className,
  disabled,
  icon,
  onClick,
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  icon: ReactNode;
  onClick: () => void;
  variant?: "default" | "subtle";
}) {
  return (
    <button
      className={cn(
        "database-setup-option",
        variant === "subtle" && "database-setup-option-subtle",
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

function TemplateIcon({
  colorId,
  icon,
}: {
  colorId: DatabaseSetupTemplate["colorId"];
  icon: ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md",
        getIconSolidClassName(colorId),
      )}
    >
      {icon}
    </span>
  );
}

function getTemplateGlyph(template: DatabaseSetupTemplate) {
  switch (template.id) {
    case "tasks-tracker":
      return <Check className="size-4" />;
    case "projects":
      return <CircleDashed className="size-4" />;
    case "document-hub":
      return <FileText className="size-4" />;
    case "content-calendar":
      return <CalendarRange className="size-4" />;
    case "meeting-notes":
      return <FileText className="size-4" />;
    case "crm":
      return <Database className="size-4" />;
    default:
      return <Database className="size-4" />;
  }
}

export function DatabaseSetupCard({
  databaseId,
  excludedDatabaseIds = [],
  onComplete,
  onDismiss,
  onSelectDataSource,
  workspaceId,
}: DatabaseSetupCardProps) {
  const [view, setView] = useState<SetupView>("main");
  const csvInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMoreTemplates, setShowMoreTemplates] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [selectedLinkDatabaseId, setSelectedLinkDatabaseId] = useState<string | null>(null);
  const [creatingLinkView, setCreatingLinkView] = useState(false);
  const [linkViewName, setLinkViewName] = useState("");

  useLayoutEffect(() => {
    if (view === "main") {
      promptInputRef.current?.focus({ preventScroll: true });
    }
  }, [view]);

  const applyTemplate = useApplyDatabaseTemplate();
  const updateDatabase = useUpdateDataSource();
  const linkDatabaseDataSource = useLinkDatabaseDataSource();
  const { data: databasePayload } = useDatabaseMetadata(databaseId);
  const { data: navigation, isLoading: isLoadingPages } = usePageNavigation(workspaceId, {
    enabled: view === "link",
  });
  const { data: selectedLinkDatabasePayload, isLoading: isLoadingLinkViews } =
    useDatabaseMetadata(selectedLinkDatabaseId);
  const dismissSetup = useCallback(async () => {
    if (
      databasePayload &&
      databasePayload.activeDataSource &&
      !getDatabaseSetupDismissed(databasePayload.activeDataSource.config)
    ) {
      await updateDatabase.mutateAsync({
        configuration: diffConfiguration(
          databasePayload.activeDataSource.config,
          getMergedDatabaseConfig(databasePayload.activeDataSource.config, {
            setupDismissed: true,
          }),
        ),
        databaseId: databasePayload.activeDataSource.id,
      });
    }

    onDismiss();
  }, [databaseId, databasePayload, onDismiss, updateDatabase]);

  const linkableDatabases = useMemo(() => {
    const excludedIds = new Set([databaseId, ...excludedDatabaseIds]);
    const pagesById = new Map((navigation?.pages ?? []).map((page) => [page.id, page]));

    return (navigation?.databases ?? [])
      .filter((database) => !excludedIds.has(database.id))
      .map((database) => ({
        database,
        pageName: database.pageId
          ? pagesById.get(database.pageId)?.name.trim() || "Untitled"
          : "Standalone",
      }));
  }, [databaseId, excludedDatabaseIds, navigation]);

  const linkableDatabaseOptions = useMemo(
    () =>
      linkableDatabases.map(({ database, pageName }) => ({
        description: pageName,
        disabled: isSubmitting,
        icon: getDatabaseIconNode(database) ?? (
          <PageIconDisplay size="sm" value={DEFAULT_DATABASE_ITEM_ICON} />
        ),
        label: database.name || "Untitled database",
        searchText: `${database.name} ${pageName}`.trim(),
        value: database.id,
      })),
    [isSubmitting, linkableDatabases],
  );

  const finishSetup = useCallback(
    async ({ csvImport, databaseName, sourceView, templateId }: DatabaseSetupSelection) => {
      setIsSubmitting(true);

      try {
        if (onSelectDataSource) {
          await onSelectDataSource({
            csvImport,
            databaseName,
            sourceView,
            templateId,
          });
          captureDatabaseSetupCompleted({
            csvImport,
            databaseName,
            sourceView,
            templateId,
          });
          onComplete();
          return;
        }

        const activeDataSource = databasePayload?.activeDataSource;

        if (!activeDataSource) {
          throw new Error("Database has no active data source.");
        }

        let setupDismissedPersisted = false;

        if (sourceView) {
          await linkDatabaseDataSource.mutateAsync({
            databaseId,
            config: sourceView.viewConfig,
            dataSourceId: sourceView.dataSourceId,
            name: sourceView.viewName,
            type: sourceView.viewType,
          });
          await updateDatabase.mutateAsync({
            configuration: diffConfiguration(
              activeDataSource.config,
              getMergedDatabaseConfig(activeDataSource.config, {
                setupDismissed: true,
              }),
            ),
            databaseId: activeDataSource.id,
          });
          setupDismissedPersisted = true;
        } else if (csvImport) {
          await applyTemplate.mutateAsync({
            config: getMergedDatabaseConfig(activeDataSource.config, {
              setupDismissed: true,
            }),
            databaseId: activeDataSource.id,
            name: csvImport.name,
            ...databaseCsvPayload(csvImport),
          });
          setupDismissedPersisted = true;
        } else if (templateId) {
          const template = getDatabaseSetupTemplate(templateId);

          if (template) {
            const nextDatabasePatch: {
              config: unknown;
              databaseId: string;
              name?: string;
            } = {
              config: getMergedDatabaseConfig(activeDataSource.config, {
                emoji: template.emoji,
                setupDismissed: true,
              }),
              databaseId: activeDataSource.id,
            };

            if (template.name !== databasePayload?.database.name) {
              nextDatabasePatch.name = template.name;
            }

            const propertyTypesByName = new Map(
              (databasePayload?.properties ?? [])
                .filter((property) => property.dataSourceId === activeDataSource.id)
                .map((property) => [property.property.name.toLowerCase(), property.property.type]),
            );

            for (const property of template.properties) {
              const propertyKey = property.name.toLowerCase();

              if (!propertyTypesByName.has(propertyKey)) {
                propertyTypesByName.set(propertyKey, property.type);
              }
            }

            await applyTemplate.mutateAsync({
              config: nextDatabasePatch.config,
              databaseId: activeDataSource.id,
              name: nextDatabasePatch.name ?? template.name,
              properties: template.properties,
              rows: databaseTemplateRows(
                template,
                propertyTypesByName,
                createSampleRowContent,
                (emoji) => getPageMetadataWithEmoji(null, emoji),
              ),
            });
            setupDismissedPersisted = true;
          }
        } else if (databaseName && databaseName !== activeDataSource.name) {
          await updateDatabase.mutateAsync({
            databaseId: activeDataSource.id,
            name: databaseName,
          });
        }

        captureDatabaseSetupCompleted({
          csvImport,
          databaseName,
          sourceView,
          templateId,
        });
        if (setupDismissedPersisted) {
          onDismiss();
        } else {
          await dismissSetup();
        }
        onComplete();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Database setup failed.";

        toast.error("Couldn't update database", { description: message });
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      applyTemplate,
      databaseId,
      databasePayload,
      dismissSetup,
      onComplete,
      onDismiss,
      onSelectDataSource,
      updateDatabase,
    ],
  );

  const handlePromptSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const nextPrompt = message.text.trim();

      if (!nextPrompt || isSubmitting) {
        return;
      }

      const templateId = inferDatabaseSetupTemplateId(nextPrompt);
      const databaseName =
        nextPrompt.length > 48 ? `${nextPrompt.slice(0, 45).trim()}...` : nextPrompt;

      await finishSetup({
        databaseName,
        templateId,
      });
    },
    [finishSetup, isSubmitting],
  );

  const handleLinkView = useCallback(
    async (sourceView: DatabaseSourceViewSelection) => {
      await finishSetup({ sourceView });
    },
    [finishSetup],
  );

  const renderTemplateButton = (template: DatabaseSetupTemplate) => (
    <SetupOptionButton
      disabled={isSubmitting}
      icon={<TemplateIcon colorId={template.colorId} icon={getTemplateGlyph(template)} />}
      key={template.id}
      onClick={() =>
        void finishSetup({
          databaseName: template.name,
          templateId: template.id,
        })
      }
    >
      {template.name}
    </SetupOptionButton>
  );

  const renderMainContent = () => (
    <div className="database-setup-columns">
      <div className="database-setup-column database-setup-column-primary">
        <div className="database-setup-prompt">
          <div className="database-setup-prompt-label">
            <Sparkles className="size-3.5" />
            <span>Describe what you want to build</span>
          </div>
          <PromptInput
            className="database-setup-prompt-form"
            inputGroupClassName="h-auto items-stretch overflow-visible border-stroke-default focus-within:border-stroke-default focus-within:ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-stroke-default has-[[data-slot=input-group-control]:focus-visible]:ring-0"
            onSubmit={handlePromptSubmit}
          >
            <div className="relative w-full min-w-0 flex-1 self-stretch">
              <PromptInputTextarea
                className="database-setup-prompt-textarea"
                disabled={isSubmitting}
                onChange={(event) => setPrompt(event.currentTarget.value)}
                placeholder="Describe what you want to build..."
                ref={promptInputRef}
                value={prompt}
              />
            </div>
            <PromptInputFooter>
              <div />
              <PromptInputSubmit
                disabled={!prompt.trim() || isSubmitting}
                status={isSubmitting ? "submitted" : undefined}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
        <div className="database-setup-actions">
          <SetupOptionButton
            disabled={isSubmitting}
            icon={
              <span className="database-setup-option-icon">
                <Plus className="size-4" />
              </span>
            }
            onClick={() => {
              if (onSelectDataSource) {
                void finishSetup({ databaseName: "New data source" });
                return;
              }

              onDismiss();
            }}
          >
            New empty data source
          </SetupOptionButton>
          <SetupOptionButton
            disabled={isSubmitting}
            icon={
              <span className="database-setup-option-icon">
                <ArrowDownToLine className="size-4" />
              </span>
            }
            onClick={() => csvInputRef.current?.click()}
          >
            Import CSV
          </SetupOptionButton>
        </div>
      </div>
      <div className="database-setup-column database-setup-column-suggested">
        <SetupSectionLabel>Suggested</SetupSectionLabel>
        <div className="database-setup-suggested-list">
          {databaseSetupSuggestedTemplates.map(renderTemplateButton)}
          {showMoreTemplates ? databaseSetupMoreTemplates.map(renderTemplateButton) : null}
          <SetupOptionButton
            disabled={isSubmitting}
            icon={
              <span className="database-setup-option-icon">
                <MoreHorizontal className="size-4" />
              </span>
            }
            onClick={() => setShowMoreTemplates((current) => !current)}
            variant="subtle"
          >
            {showMoreTemplates ? "Fewer templates" : "More templates"}
          </SetupOptionButton>
        </div>
        <div className="database-setup-link-action">
          <SetupOptionButton
            disabled={isSubmitting}
            icon={
              <span className="database-setup-option-icon">
                <ArrowUpRight className="size-4" />
              </span>
            }
            onClick={() => {
              setView("link");
              setSelectedLinkDatabaseId(null);
              setCreatingLinkView(false);
              setLinkViewName("");
              setLinkSearch("");
            }}
          >
            Link to existing data source
          </SetupOptionButton>
        </div>
      </div>
    </div>
  );

  const renderLinkPicker = () => {
    if (selectedLinkDatabaseId) {
      const sourceDataSourceId = selectedLinkDatabasePayload?.activeDataSource?.id;
      const views =
        selectedLinkDatabasePayload?.views.filter(
          (viewItem) => !sourceDataSourceId || viewItem.dataSourceId === sourceDataSourceId,
        ) ?? [];
      const databaseName =
        selectedLinkDatabasePayload?.database.name ??
        linkableDatabases.find((item) => item.database.id === selectedLinkDatabaseId)?.database
          .name ??
        "Untitled database";

      if (creatingLinkView && sourceDataSourceId) {
        return (
          <div className="space-y-3 px-3 py-3 pr-12">
            <SetupOptionButton
              icon={<ChevronLeft className="size-4 text-content-secondary" />}
              onClick={() => {
                setCreatingLinkView(false);
                setLinkViewName("");
              }}
            >
              Choose another view
            </SetupOptionButton>
            <Input
              aria-label="Linked view name"
              autoFocus
              onChange={(event) => setLinkViewName(event.currentTarget.value)}
              placeholder="View name"
              value={linkViewName}
            />
            <ViewTypeOptionGrid
              className="p-0"
              onSelect={(type: DatabaseViewType) => {
                const { label } = getDatabaseViewTypePresentation(type);

                void handleLinkView({
                  dataSourceId: sourceDataSourceId,
                  dataSourceName:
                    selectedLinkDatabasePayload.activeDataSource?.name || databaseName,
                  parentDatabaseId: selectedLinkDatabaseId,
                  viewId: `new-${type}`,
                  viewName: linkViewName.trim() || label,
                  viewType: type,
                });
              }}
            />
          </div>
        );
      }

      return (
        <div className="flex max-h-[min(32rem,calc(100vh-5rem))] min-h-0 flex-col px-1 pb-1">
          <SetupOptionButton
            icon={<ChevronLeft className="size-4 text-content-secondary" />}
            onClick={() => {
              setSelectedLinkDatabaseId(null);
              setCreatingLinkView(false);
              setLinkViewName("");
            }}
          >
            Back
          </SetupOptionButton>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <SetupOptionButton
              disabled={!sourceDataSourceId || isSubmitting}
              icon={
                <span className="database-setup-option-icon">
                  <Plus className="size-4" />
                </span>
              }
              onClick={() => setCreatingLinkView(true)}
            >
              Create a new view
            </SetupOptionButton>
            <div className="px-2 pt-3 text-content-secondary text-xs">Views on {databaseName}</div>
            {isLoadingLinkViews ? (
              <div className="flex items-center justify-center gap-2 px-2 py-8 text-content-secondary text-sm">
                <Loader2 className="size-4 animate-spin" />
                Loading views...
              </div>
            ) : views.length === 0 ? (
              <div className="px-2 py-8 text-center text-content-secondary text-sm">
                No existing views.
              </div>
            ) : (
              views.map((viewItem) => {
                const { Icon: ViewIcon } = getDatabaseViewTypePresentation(viewItem.type);

                return (
                  <SetupOptionButton
                    disabled={isSubmitting}
                    icon={
                      <span className="database-setup-option-icon">
                        <ViewIcon className="size-4" />
                      </span>
                    }
                    key={viewItem.id}
                    onClick={() =>
                      void handleLinkView({
                        dataSourceId: viewItem.dataSourceId,
                        dataSourceName: databaseName,
                        parentDatabaseId: selectedLinkDatabaseId,
                        viewConfig: viewItem.config,
                        viewIcon: getDatabaseViewIcon(viewItem.config),
                        viewId: viewItem.id,
                        viewName: viewItem.name,
                        viewType: viewItem.type,
                      })
                    }
                  >
                    {viewItem.name}
                  </SetupOptionButton>
                );
              })
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex max-h-[min(32rem,calc(100vh-5rem))] min-h-0 flex-col overflow-hidden px-1 pb-1">
        <div className="shrink-0 bg-surface-card">
          <SetupOptionButton
            icon={<ChevronLeft className="size-4 text-content-secondary" />}
            onClick={() => {
              setView("main");
              setSelectedLinkDatabaseId(null);
              setCreatingLinkView(false);
              setLinkViewName("");
              setLinkSearch("");
            }}
          >
            Back
          </SetupOptionButton>
        </div>
        <PageDatabasePicker
          ariaLabel="Search databases"
          className="min-h-0 flex-1"
          emptyMessage="No databases available."
          heading="Databases"
          isLoading={isLoadingPages}
          loadingMessage="Loading databases..."
          onQueryChange={setLinkSearch}
          onSelect={(option) => setSelectedLinkDatabaseId(option.value)}
          options={linkableDatabaseOptions}
          placeholder="Search databases..."
          query={linkSearch}
        />
      </div>
    );
  };

  return (
    <div className="database-setup-overlay">
      <div className="database-setup-card">
        <input
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;

            void file
              .text()
              .then((text) => {
                const csv = parseCsv(text);
                if (csv.headers.length === 0) {
                  toast.error("The CSV file has no columns.");
                  return;
                }

                const name = file.name.replace(/\.csv$/i, "").trim() || "Imported data";
                void finishSetup({
                  csvImport: { ...csv, name },
                  databaseName: name,
                });
              })
              .catch(() => toast.error("The CSV file could not be read."));
          }}
          ref={csvInputRef}
          type="file"
        />
        <Button
          aria-label="Close database setup"
          className="database-setup-close"
          onClick={() => {
            if (onSelectDataSource) {
              onDismiss();
              return;
            }

            void dismissSetup();
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
        {view === "main" ? renderMainContent() : renderLinkPicker()}
        {isSubmitting ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-effect-backdrop backdrop-blur-[1px]">
            <Loader2 className="size-5 animate-spin text-content-secondary" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
