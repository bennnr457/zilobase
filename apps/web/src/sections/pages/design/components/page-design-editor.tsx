import { ButtonGroup } from "@/components/ui/button-group";
import { Check, ChevronDown, SidebarSimpleIcon, X } from "@/components/icons";
import { resolvePageLayoutDatabaseId } from "@zilobase/features/pages";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { PageDesignSettings } from "./page-design-settings";

import { Editor } from "@/sections/pages/editor/editor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useDatabaseBootstrap,
  useDatabaseIdForRowPage,
  useDatabaseRecords,
} from "@zilobase/features/databases/react";
import {
  getPageCover,
  getPageEmoji,
  getPageIconPosition,
  resolvePageFullWidth,
  type PageLayoutConfig,
  type PageLayoutScope,
} from "@zilobase/features/pages";
import {
  usePage,
  usePageNavigation,
  useResetPageLayout,
  useResolvedPageLayout,
  useSavePageLayout,
} from "@zilobase/features/pages/react";
import { defaultUserSettings } from "@zilobase/features/user-settings";
import { useUpdateUserSettings, useUserSettings } from "@zilobase/features/user-settings/react";

type LayoutEditorTarget = {
  databaseId?: string | null;
  pageId?: string | null;
};
type LayoutEditorContextValue = {
  openLayoutEditor: (target: LayoutEditorTarget) => void;
};

const saveSuccessMessages: Record<PageLayoutScope, string> = {
  database: "Database layout saved.",
  page: "Page layout saved.",
  workspace: "Workspace layout saved.",
};

function withoutLayoutFullWidth(config: PageLayoutConfig): PageLayoutConfig {
  const { fullWidth: _fullWidth, ...layoutConfig } = config;
  return layoutConfig;
}

const LayoutEditorContext = createContext<LayoutEditorContextValue | null>(null);

export function usePageDesignEditor() {
  const context = useContext(LayoutEditorContext);
  if (!context) {
    throw new Error("usePageDesignEditor must be used inside PageDesignEditorProvider");
  }
  return context;
}

export function PageDesignEditorProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<LayoutEditorTarget | null>(null);
  const openLayoutEditor = useCallback((next: LayoutEditorTarget) => setTarget(next), []);
  const value = useMemo(() => ({ openLayoutEditor }), [openLayoutEditor]);

  return (
    <LayoutEditorContext.Provider value={value}>
      {children}
      {target ? <LayoutEditor onClose={() => setTarget(null)} target={target} /> : null}
    </LayoutEditorContext.Provider>
  );
}

function PreviewPageDropdown({
  currentPageId,
  hasMore,
  loading,
  onLoadMore,
  onSelect,
  pages,
  previewName,
}: {
  currentPageId: string | null | undefined;
  hasMore?: boolean;
  loading?: boolean;
  onLoadMore?: () => void;
  onSelect: (pageId: string) => void;
  pages: Array<{ id: string; name: string }>;
  previewName: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="min-w-0 justify-start gap-2 px-2"
          title={`Preview: ${previewName}`}
          type="button"
          variant="ghost"
        >
          <span className="min-w-0 truncate text-sm font-medium">{previewName}</span>
          <ChevronDown className="size-4 shrink-0 text-content-secondary" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[110] w-72">
        {pages.length ? (
          <>
            {pages.map((page) => (
              <DropdownMenuItem key={page.id} onSelect={() => onSelect(page.id)}>
                <span className="min-w-0 flex-1 truncate">{page.name}</span>
                {page.id === currentPageId ? <Check className="ml-auto" /> : null}
              </DropdownMenuItem>
            ))}
            {hasMore ? (
              <DropdownMenuItem onSelect={onLoadMore}>Load more pages</DropdownMenuItem>
            ) : null}
          </>
        ) : loading ? (
          <DropdownMenuItem disabled>Loading pages...</DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>No database pages</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LayoutEditor({ onClose, target }: { onClose: () => void; target: LayoutEditorTarget }) {
  const { data: resolved, isLoading } = useResolvedPageLayout(target);
  const pageId = target.pageId ?? resolved?.pageId ?? null;
  const cachedRowDatabaseId = useDatabaseIdForRowPage(
    pageId,
    target.databaseId ?? resolved?.databaseId ?? null,
  );
  const [previewPageId, setPreviewPageId] = useState<string | null>(pageId ?? null);
  const effectivePreviewPageId = previewPageId ?? pageId;
  const { data: page } = usePage(effectivePreviewPageId, {
    refetchOnMount: false,
  });
  const workspaceId = page?.workspaceId ?? resolved?.workspaceId ?? null;
  const { data: navigation, isLoading: navigationLoading } = usePageNavigation(workspaceId);
  const databaseId = resolvePageLayoutDatabaseId({
    pageId,
    targetDatabaseId: target.databaseId,
    resolvedDatabaseId: resolved?.databaseId,
    cachedRowDatabaseId,
    placements: navigation?.placements,
  });
  const databaseBootstrap = useDatabaseBootstrap(databaseId ? { databaseId } : null);
  const databaseMetadata = databaseBootstrap.data;
  const metadataLoading = databaseBootstrap.status === "loading";
  const previewView = databaseMetadata?.views[0];
  const databaseRecords = useDatabaseRecords(
    databaseId && previewView
      ? {
          databaseId,
          dataSourceId: previewView.dataSourceId,
          viewId: previewView.id,
        }
      : null,
  );
  const databaseLoading =
    metadataLoading || databaseRecords.status === "loading" || databaseRecords.isFetchingNextPage;
  const { data: userSettings = defaultUserSettings } = useUserSettings();
  const [draft, setDraft] = useState<PageLayoutConfig | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const saveLayout = useSavePageLayout();
  const resetLayout = useResetPageLayout();
  const updateUserSettings = useUpdateUserSettings();
  const layoutMutationPending = saveLayout.isPending || resetLayout.isPending;

  useEffect(() => {
    if (resolved?.config) {
      setDraft(withoutLayoutFullWidth(resolved.config));
    }
  }, [resolved?.config]);

  useEffect(() => {
    setPreviewPageId(pageId ?? null);
  }, [pageId]);

  const previewName = page?.name?.trim() || (databaseId ? "Untitled" : "New page");
  const previewIcon = page ? getPageEmoji(page) : null;
  const previewCover = page ? getPageCover(page) : null;
  const previewIconPosition = page ? getPageIconPosition(page) : "top";
  const previewWorkspaceId = page?.workspaceId ?? databaseMetadata?.database.workspaceId ?? null;
  const fullWidth = resolvePageFullWidth(page, userSettings.pageFullWidth);
  const previewPages = useMemo(
    () =>
      databaseRecords.records
        .filter((row) => !row.page.deletedAt)
        .map((row) => ({
          id: row.pageId,
          name: row.page.name.trim() || "Untitled",
        })),
    [databaseRecords.records],
  );
  const resolvedConfig = useMemo(
    () => (resolved?.config ? withoutLayoutFullWidth(resolved.config) : null),
    [resolved?.config],
  );
  const dirty = useMemo(
    () =>
      Boolean(draft && resolvedConfig && JSON.stringify(draft) !== JSON.stringify(resolvedConfig)),
    [draft, resolvedConfig],
  );

  const close = () => {
    if (dirty && !window.confirm("Discard your unsaved layout changes?")) return;
    onClose();
  };

  const save = async (scope: PageLayoutScope) => {
    if (!draft || !resolved) return;
    const scopeId =
      scope === "workspace" ? resolved.workspaceId : scope === "database" ? databaseId : pageId;
    if (!scopeId) return;
    try {
      await saveLayout.mutateAsync({
        clearPageOverrides: scope === "database" || undefined,
        config: withoutLayoutFullWidth(draft),
        scope,
        scopeId,
      });
      toast.success(saveSuccessMessages[scope]);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save layout.");
    }
  };

  const setFullWidth = (nextFullWidth: boolean) => {
    updateUserSettings.mutate(
      { pageFullWidth: nextFullWidth },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error ? error.message : "Could not update full width setting.",
          );
        },
      },
    );
  };

  if (isLoading || !draft || !resolved) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-surface-canvas text-sm text-content-secondary">
        Loading layout…
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex h-svh flex-col bg-surface-canvas text-content-primary">
      <header className="flex h-14 shrink-0 items-center border-b px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SidebarSimpleIcon className="size-4 text-content-secondary" />
          <PreviewPageDropdown
            currentPageId={effectivePreviewPageId}
            hasMore={databaseRecords.hasMore}
            loading={navigationLoading || (Boolean(databaseId) && databaseLoading)}
            onLoadMore={() => void databaseRecords.fetchNextPage()}
            onSelect={setPreviewPageId}
            pages={previewPages}
            previewName={previewName}
          />
        </div>
        <Button onClick={close} variant="ghost">
          <X /> Cancel
        </Button>
        <ButtonGroup className="ml-2" variant="connected" aria-label="Apply layout">
          <Button disabled={layoutMutationPending} onClick={() => setApplyDialogOpen(true)}>
            <Check /> Apply
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Choose apply scope"
                className="px-2"
                disabled={layoutMutationPending}
              >
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[110] w-60">
              <DropdownMenuItem onSelect={() => save("workspace")}>
                Workspace default
              </DropdownMenuItem>
              {resolved.sources.generic ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={async () => {
                    const scope = target.databaseId ? "database" : "page";
                    const scopeId = scope === "database" ? databaseId : pageId;
                    if (!scopeId) return;
                    await resetLayout.mutateAsync({ scope, scopeId });
                    toast.success("Layout reset to inherited settings.");
                    onClose();
                  }}
                >
                  Reset to inherited layout
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      </header>

      <div className="flex min-h-0 flex-1">
        <PageDesignSettings
          draft={draft}
          fullWidth={fullWidth}
          fullWidthPending={updateUserSettings.isPending}
          onChange={setDraft}
          onDiscussionsVisibleChange={(discussionsVisible) =>
            setDraft((current) => (current ? { ...current, discussionsVisible } : current))
          }
          onFullWidthChange={setFullWidth}
        />

        <main className="min-w-0 flex-1 overflow-hidden bg-surface-subtle">
          <div className="h-full w-full">
            <Editor
              session={{
                kind: "local",
                content: page?.content ?? "",
                databaseId,
                pageId: effectivePreviewPageId,
                workspaceId: previewWorkspaceId,
              }}
              capabilities={{ content: false }}
              presentation={{
                cover: previewCover ?? undefined,
                emoji: previewIcon ?? undefined,
                iconPosition: previewIconPosition,
                fullWidth,
                layoutConfig: draft,
                layoutPreview: true,
                onLayoutChange: setDraft,
                title: previewName,
              }}
            />
          </div>
        </main>
      </div>

      <PageDesignApplyDialog
        databaseAvailable={Boolean(databaseId)}
        onApply={(scope) => void save(scope)}
        onOpenChange={setApplyDialogOpen}
        open={applyDialogOpen}
        pageAvailable={Boolean(pageId)}
        pending={saveLayout.isPending}
      />
    </div>
  );
}

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ApplyScope = Extract<PageLayoutScope, "database" | "page">;

type LayoutApplyDialogProps = {
  databaseAvailable: boolean;
  onApply: (scope: ApplyScope) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pageAvailable: boolean;
  pending?: boolean;
};

function PageDesignApplyDialog({
  databaseAvailable,
  onApply,
  onOpenChange,
  open,
  pageAvailable,
  pending = false,
}: LayoutApplyDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="z-[110]" overlayClassName="z-[109]">
        <DialogHeader>
          <DialogTitle>Apply this layout?</DialogTitle>
          <DialogDescription>
            Choose which pages should use all of these layout settings.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          {pageAvailable ? (
            <Button
              disabled={pending}
              onClick={() => onApply("page")}
              type="button"
              variant={databaseAvailable ? "outline" : "default"}
            >
              This page
            </Button>
          ) : null}
          {databaseAvailable ? (
            <Button disabled={pending} onClick={() => onApply("database")} type="button">
              All pages in this database
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
