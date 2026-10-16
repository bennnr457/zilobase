import { Effect } from "effect";
import { commitDatabaseBlockDrop } from "./drag-drop/block-drop";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { EditorContent } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { MobileActionBar } from "./toolbar/mobile-action-bar";
import { PageMetadata, type PageMetadataHandle } from "@/components/pages/page-metadata";
import { PageDesignCanvas } from "./document-design/page-design-canvas";
import { PageDesignTabs } from "./document-design/page-design-tabs";
import { EditorChrome } from "./editor-chrome";
import type { EditorProps, PasteChoiceState } from "./editor-types";
import { useEditorResourceActions } from "./commands/use-editor-resource-actions";
import { resolveBlockDragTargetFromPoint } from "./drag-drop/block-drag-geometry";
import { useEditorWorkspace } from "./runtime/page-editor-registry";
import { createPositionAnchor } from "./operations/position-anchor";
import { useEditorExtensions } from "./runtime/use-editor-extensions";
import { useEditorInstance } from "./runtime/use-editor-instance";
import { useEditorMenuEffects } from "./runtime/use-editor-menu-effects";
import { useEditorRuntime } from "./runtime/use-editor-runtime";
import { useMobileNodeActions } from "./commands/use-mobile-node-actions";
import { DatabaseView } from "@/components/databases/views/shared/database-view";
import { canMoveDatabaseBlockToPage, getBlockDragDatabaseId } from "./drag-drop/block-drag";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DatabaseBlockDropDialog,
  type PendingDatabaseBlockDrop,
} from "./drag-drop/database-block-drop-dialog";
import { hasPendingCollaborationChanges } from "./collaboration/collaboration-readiness";

const starterContent = `
  <h1>Draft your next page doc</h1>
  <p>
    Type <code>/</code> on a new line to open the block menu. Use Markdown-style
    shortcuts, checklists, quotes, code blocks, and rich inline formatting.
  </p>
  <ul data-type="taskList">
    <li data-type="taskItem" data-checked="false">Capture the idea</li>
    <li data-type="taskItem" data-checked="true">Shape it into a clean doc</li>
  </ul>
  <blockquote>Fast notes, structured blocks, zero ceremony.</blockquote>
`;

export function Editor({
  session = {},
  capabilities = {},
  actions = {},
  presentation = {},
  view = {},
}: EditorProps = {}) {
  const {
    collaboration,
    collaborationField,
    content = starterContent,
    databaseId,
    databaseIds = [],
    pageId,
    workspaceId,
  } = session;
  const {
    afterMetadata,
    commentController,
    cover,
    emoji,
    iconPosition,
    fullWidth = true,
    hideEditorContent = false,
    hideMetadata = false,
    layoutConfig,
    layoutPanelMode = "auto",
    layoutPreview = false,
    onLayoutChange,
    title,
    enableComments = true,
  } = presentation;
  const { editorContentRef, editorTabIndex, onEditorReady } = view;
  const {
    onContentChange,
    onCoverChange,
    onCreatePage,
    onEmbedDatabase,
    onEmbedPage,
    onEmojiChange,
    onIconPositionChange,
    getStructuralBlockDeleteAction,
    onDeleteStructuralBlock,
    onOpenPage,
    onStructuralInsertionPendingChange,
    onTitleChange,
  } = actions;
  const editable = capabilities.content ?? true;
  const contentEditable = editable;
  const metadataEditable = capabilities.metadata ?? editable;
  const structuralEditingEnabled = capabilities.structural ?? editable;
  const commentsEditable = capabilities.comments ?? (enableComments && editable);
  const databaseEditable = capabilities.database ?? editable;
  const generatedViewId = useId();
  const editorId = view.viewId ?? generatedViewId;
  const workspace = useEditorWorkspace();
  const runtimeStateRef = useRef({ session, capabilities, actions });
  runtimeStateRef.current = { session, capabilities, actions };
  const runtime = useMemo(
    () => ({
      getSession: () => runtimeStateRef.current.session,
      getCapabilities: () => runtimeStateRef.current.capabilities,
      getActions: () => runtimeStateRef.current.actions,
    }),
    [],
  );
  const editorSurfaceRef = useRef<HTMLElement | null>(null);
  const pageMetadataRef = useRef<PageMetadataHandle | null>(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [dragHandleMenuOpen, setDragHandleMenuOpen] = useState(false);
  const [blockCommentOpen, setBlockCommentOpen] = useState(false);
  const [pasteChoice, setPasteChoice] = useState<PasteChoiceState | null>(null);
  const [pendingDatabaseBlockDrop, setPendingDatabaseBlockDrop] =
    useState<PendingDatabaseBlockDrop | null>(null);
  const [activeLayoutTab, setActiveLayoutTab] = useState("content");
  const pendingDatabaseCommitRef = useRef(false);
  const pendingDropRef = useRef(pendingDatabaseBlockDrop);
  pendingDropRef.current = pendingDatabaseBlockDrop;
  useEffect(
    () => () => {
      pendingDropRef.current?.anchor.dispose();
    },
    [],
  );
  const pageContentLayout = fullWidth
    ? { className: "", mode: "full" as const }
    : { className: "mx-auto max-w-[900px]", mode: "narrow" as const };
  const activeLinkedTab = layoutConfig?.linkedTabs.find((tab) => tab.id === activeLayoutTab);
  const collaborationHasPendingChanges = hasPendingCollaborationChanges(collaboration);

  useEffect(() => {
    if (
      layoutConfig?.structure !== "tabbed" ||
      (activeLayoutTab !== "content" && !activeLinkedTab)
    ) {
      setActiveLayoutTab("content");
    }
  }, [activeLayoutTab, activeLinkedTab, layoutConfig?.structure]);

  useEffect(() => {
    if (!collaborationHasPendingChanges) return;

    const preventUnsyncedReload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", preventUnsyncedReload);
    return () => window.removeEventListener("beforeunload", preventUnsyncedReload);
  }, [collaborationHasPendingChanges]);

  const { databaseEditorRuntime } = useEditorRuntime(databaseEditable);
  const { createEditorDatabase, createEditorMeeting, handleDatabasePageDrop } =
    useEditorResourceActions(workspaceId, pageId);

  const { editorExtensions, editorLifecycleKey, initialContent, tocItems } = useEditorExtensions({
    collaboration,
    collaborationField,
    content,
    createEditorDatabase,
    createEditorMeeting,
    databaseEditorRuntime,
    editable: contentEditable,
    structuralEditingEnabled,
    onCreatePage,
    onEmbedPage,
    onOpenPage,
    onStructuralInsertionPendingChange,
    workspaceId,
    pageId,
  });

  const { blockDropLine, editor, surfaceDragHandlers } = useEditorInstance({
    workspace,
    runtime,
    documentKey: `${session.kind ?? "page"}:${session.documentId ?? pageId ?? editorId}:${collaborationField ?? "default"}:${layoutPreview ? editorId : ""}`,
    databaseEditorRuntime,
    dropPageOnDatabase: handleDatabasePageDrop,
    editable: contentEditable,
    editorContentRef,
    editorSurfaceRef,
    editorExtensions,
    editorId,
    editorLifecycleKey,
    editorTabIndex,
    initialContent,
    onContentChange,
    onCrossEditorDatabaseDrop: ({ payload, pos }) => {
      const sourceDatabaseId = getBlockDragDatabaseId(payload);
      if (!sourceDatabaseId || !workspace.drag.source(payload)) return false;

      setPendingDatabaseBlockDrop({
        canMove:
          Boolean(
            actions.onMoveDatabase &&
            workspace.runtimes.get(workspace.drag.active!.editor)?.getSession().pageId,
          ) && canMoveDatabaseBlockToPage(sourceDatabaseId, databaseId, databaseIds),
        databaseId: sourceDatabaseId,
        payload,
        pos,
        anchor: createPositionAnchor(editor!, pos),
      });
      workspace.drag.transition("awaiting-choice");
      return true;
    },
    onEditorReady,
    onEmbedPage,
    onOpenPage,
    onMoveToTitle: () => pageMetadataRef.current?.focusTitleEnd() ?? false,
    setPasteChoice,
    pageId,
  });

  const completeDatabaseBlockDrop = async (mode: "copy" | "move") => {
    if (!editor || !pendingDatabaseBlockDrop || pendingDatabaseCommitRef.current) return;
    pendingDatabaseCommitRef.current = true;
    workspace.drag.transition("awaiting-resource");
    const releasePending = workspace.beginOperation([
      editor,
      ...(workspace.drag.active ? [workspace.drag.active.editor] : []),
    ]);
    return Effect.runPromise(
      commitDatabaseBlockDrop({
        editor,
        workspace,
        pendingDrop: pendingDatabaseBlockDrop,
        mode,
        actions: { onEmbedDatabase, onMoveDatabase: actions.onMoveDatabase },
        onComplete: () => setPendingDatabaseBlockDrop(null),
        onError: (message) => toast.error(message),
        onSettled: () => {
          pendingDatabaseCommitRef.current = false;
          pendingDatabaseBlockDrop.anchor.dispose();
          workspace.drag.reset();
          setPendingDatabaseBlockDrop(null);
          releasePending();
        },
      }),
    );
  };

  useEffect(() => {
    commentController?.setEditor(editor ?? null);
    return () => commentController?.setEditor(null);
  }, [commentController, editor]);

  useEditorMenuEffects({
    dragHandleMenuOpen,
    editorSurfaceRef,
    plusMenuOpen,
    setPlusMenuOpen,
  });

  const resolveDragTargetFromPoint = useCallback(
    (clientX: number, clientY: number) =>
      editor && !editor.isDestroyed
        ? resolveBlockDragTargetFromPoint({
            clientX,
            clientY,
            currentTarget: null,
            view: editor.view,
          })
        : null,
    [editor],
  );

  const { mobileNodeTarget, canMoveMobileTarget, moveMobileTarget, handleMobileNodeClick } =
    useMobileNodeActions(editor, resolveDragTargetFromPoint);

  const handleClosePasteChoice = useCallback(() => setPasteChoice(null), []);

  const focusPageBodyFromTitle = useCallback(() => {
    if (!editor || !editable) return;

    const firstNode = editor.state.doc.firstChild;

    if (!firstNode || (firstNode.isTextblock && firstNode.content.size === 0)) {
      editor.chain().focus("start").run();
      return;
    }

    const paragraph = editor.schema.nodes.paragraph?.create();

    if (!paragraph) {
      editor.chain().focus("start").run();
      return;
    }

    const transaction = editor.state.tr.insert(0, paragraph);
    transaction.setSelection(TextSelection.create(transaction.doc, 1));
    editor.view.dispatch(transaction.scrollIntoView());
    editor.view.focus();
  }, [editable, editor]);

  const renderLayoutModule = (module: NonNullable<typeof layoutConfig>["modules"][number]) => {
    if (module.type === "content") {
      return (
        <div
          className={cn(
            "relative min-w-0 max-w-full",
            module.region === "panel" ? "px-4 py-4" : pageContentLayout.className,
            layoutPreview && "h-[32rem] overflow-hidden",
            onLayoutChange &&
              module.region === "main" &&
              "[&_.tiptap-editor]:px-8 [&_.tiptap-editor]:py-5",
          )}
          data-editor-page-content={pageContentLayout.mode}
          data-layout-content-preview={layoutPreview ? "true" : undefined}
          key={module.id}
        >
          <EditorContent editor={editor} />
          {layoutPreview ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-surface-canvas via-effect-backdrop to-transparent"
            />
          ) : null}
        </div>
      );
    }

    if (module.type === "discussions" && layoutConfig?.discussionsVisible === false) {
      return null;
    }

    const layoutSection =
      module.type === "heading"
        ? "heading"
        : module.type === "discussions"
          ? "discussions"
          : "properties";

    return (
      <PageMetadata
        afterHeading={
          module.type === "heading" && afterMetadata ? (
            <div className={cn("pt-4", hideEditorContent && "pb-10")}>{afterMetadata}</div>
          ) : null
        }
        compact={module.region === "panel" || Boolean(onLayoutChange)}
        compactSpacing={onLayoutChange ? "comfortable" : "default"}
        collaborationUsers={module.type === "heading" ? collaboration?.users : undefined}
        contentClassName={module.region === "panel" ? undefined : pageContentLayout.className}
        cover={cover}
        databaseId={databaseId}
        editable={metadataEditable}
        enableComments={enableComments}
        forceDiscussionsExpanded={module.type === "discussions"}
        icon={emoji}
        iconPosition={iconPosition}
        key={module.id}
        layoutConfig={layoutConfig}
        layoutPropertyId={module.type === "property" ? module.propertyId : undefined}
        layoutSection={layoutSection}
        onCoverChange={onCoverChange}
        onIconChange={onEmojiChange}
        onIconPositionChange={onIconPositionChange}
        onOpenPage={onOpenPage}
        onTitleEnter={focusPageBodyFromTitle}
        onTitleChange={onTitleChange}
        workspaceId={workspaceId}
        title={title}
        pageId={pageId}
        ref={module.type === "heading" ? pageMetadataRef : undefined}
      />
    );
  };

  const editorBody = (
    <div
      className={cn(
        "flex w-full flex-col text-content-primary",
        layoutPreview
          ? "h-full min-h-0"
          : hideMetadata
            ? "min-h-[16rem]"
            : "min-h-[calc(100svh-3rem)]",
      )}
    >
      <section
        className={cn("relative min-h-0 flex-1", layoutPreview && "flex flex-col overflow-hidden")}
        data-editor-surface
        data-editor-view-id={editorId}
        data-editor-pane-id={view.paneId ?? editorId}
        ref={editorSurfaceRef}
        onDragEnd={surfaceDragHandlers.onDragEnd}
        onDragLeave={surfaceDragHandlers.onDragLeave}
        onDragOver={surfaceDragHandlers.onDragOver}
        onDragOverCapture={surfaceDragHandlers.onDragOverCapture}
        onDrop={surfaceDragHandlers.onDrop}
        onClickCapture={handleMobileNodeClick}
      >
        <EditorChrome
          blockDropLine={blockDropLine}
          blockCommentOpen={blockCommentOpen}
          commentController={
            commentsEditable && commentController?.canEdit ? commentController : undefined
          }
          createEditorDatabase={createEditorDatabase}
          createEditorMeeting={createEditorMeeting}
          editable={contentEditable && structuralEditingEnabled}
          editor={editor}
          editorId={editorId}
          dragHandleMenuOpen={dragHandleMenuOpen || blockCommentOpen}
          getStructuralBlockDeleteAction={getStructuralBlockDeleteAction}
          onClosePasteChoice={handleClosePasteChoice}
          onDeleteStructuralBlock={onDeleteStructuralBlock}
          onStructuralInsertionPendingChange={onStructuralInsertionPendingChange}
          pageId={pageId}
          pasteChoice={pasteChoice}
          plusMenuOpen={plusMenuOpen}
          setDragHandleMenuOpen={setDragHandleMenuOpen}
          setBlockCommentOpen={setBlockCommentOpen}
          setPlusMenuOpen={setPlusMenuOpen}
          tocItems={layoutPreview ? [] : tocItems}
        />
        {hideMetadata ? (
          <div className="min-w-0" data-editor-page-content={pageContentLayout.mode}>
            <EditorContent editor={editor} />
          </div>
        ) : layoutConfig ? (
          <PageDesignCanvas
            config={layoutConfig}
            fixedAfterHeading={
              layoutConfig.structure === "tabbed" ? (
                <PageDesignTabs
                  config={layoutConfig}
                  onChange={onLayoutChange}
                  onValueChange={setActiveLayoutTab}
                  value={activeLayoutTab}
                />
              ) : undefined
            }
            fullWidth={fullWidth}
            pageId={pageId}
            mainContentOverride={
              activeLinkedTab ? (
                <div
                  className={cn(
                    "relative min-w-0 p-5 md:px-12",
                    layoutPreview ? "h-[32rem] overflow-hidden" : "min-h-[calc(100svh-6rem)]",
                  )}
                >
                  <DatabaseView
                    activeViewId={activeLinkedTab.viewId}
                    databaseId={activeLinkedTab.databaseId}
                    editable={databaseEditable}
                    fullPage
                    onOpenPage={onOpenPage}
                    pageId={pageId}
                    showExpandButton={false}
                    workspaceId={workspaceId}
                  />
                  {layoutPreview ? (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-surface-canvas via-effect-backdrop to-transparent"
                    />
                  ) : null}
                </div>
              ) : undefined
            }
            onChange={onLayoutChange}
            panelMode={layoutPanelMode}
            renderModule={renderLayoutModule}
          />
        ) : (
          <>
            <PageMetadata
              afterHeading={
                afterMetadata ? (
                  <div className={cn("pt-4", hideEditorContent && "pb-10")}>{afterMetadata}</div>
                ) : null
              }
              collaborationUsers={collaboration?.users}
              contentClassName={pageContentLayout.className}
              cover={cover}
              databaseId={databaseId}
              editable={metadataEditable}
              enableComments={enableComments}
              icon={emoji}
              iconPosition={iconPosition}
              onCoverChange={onCoverChange}
              onIconChange={onEmojiChange}
              onIconPositionChange={onIconPositionChange}
              onOpenPage={onOpenPage}
              onTitleEnter={focusPageBodyFromTitle}
              onTitleChange={onTitleChange}
              workspaceId={workspaceId}
              title={title}
              pageId={pageId}
              ref={pageMetadataRef}
            />
            <div
              className={pageContentLayout.className}
              data-editor-page-content={pageContentLayout.mode}
            >
              {hideEditorContent ? null : <EditorContent editor={editor} />}
            </div>
          </>
        )}
        {contentEditable && structuralEditingEnabled && mobileNodeTarget ? (
          <MobileActionBar
            canMoveDown={canMoveMobileTarget("down")}
            canMoveUp={canMoveMobileTarget("up")}
            onMoveDown={() => moveMobileTarget("down")}
            onMoveUp={() => moveMobileTarget("up")}
          />
        ) : null}
      </section>
    </div>
  );

  return (
    <>
      {editorBody}
      <DatabaseBlockDropDialog
        onClose={() => {
          if (pendingDatabaseCommitRef.current) return;
          pendingDatabaseBlockDrop?.anchor.dispose();
          workspace.drag.reset();
          setPendingDatabaseBlockDrop(null);
        }}
        onCopy={() => void completeDatabaseBlockDrop("copy")}
        onMove={() => void completeDatabaseBlockDrop("move")}
        pending={pendingDatabaseBlockDrop}
      />
    </>
  );
}
