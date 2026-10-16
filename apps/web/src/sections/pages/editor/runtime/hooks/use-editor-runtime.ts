import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { useEditor } from "@tiptap/react";
import type { Content, Editor, Extensions } from "@tiptap/core";
import type { TableOfContentDataItem } from "@tiptap/extension-table-of-contents";
import { createBaseExtensions } from "../../extensions/lib/create-base-extensions";
import { Selection, TextSelection, type EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { toast } from "sonner";
import type { DatabaseBlockEditorRuntime } from "@/sections/databases/blocks/lib/database-block-contracts";
import { createEditorDragDrop, type BlockDragPayload } from "../../drag-drop/lib/block-drag";
import {
  getDropDatabaseElement,
  insertDraggedDatabasePage,
  isDraggingPageToEditor,
  shouldSkipEditorDropLine,
} from "../../drag-drop/lib/database-page-drag";
import {
  handleEditorPaste,
  handleTypedLinkChoice,
  normalizePastedEditorHTML,
} from "../../paste/lib/paste";
import type { EditorWorkspace } from "../lib/editor-workspace";
import type {
  UseEditorExtensionsOptions,
  BlockDropLine,
  PasteChoiceState,
} from "../../lib/editor-types";
import type { OpenPageOptions } from "@/sections/pages/navigation/hooks/page-navigation";

import {
  handleProtectedStructuralBlockClipboardMutation,
  handleProtectedStructuralBlockDeleteKey,
  handleProtectedStructuralBlockBeforeInput,
} from "../../paste/lib/protected-structural-blocks";
import {
  handleBlockSelectionBeforeInput,
  handleBlockSelectionClipboardMutation,
  handleBlockSelectionKeyDown,
} from "../../extensions/lib/block-selection";

type UseEditorInstanceOptions = {
  workspace: EditorWorkspace;
  runtime: import("../../lib/editor-types").EditorRuntimeHandle;
  documentKey: string;
  databaseEditorRuntime: DatabaseBlockEditorRuntime;
  dropPageOnDatabase: (event: DragEvent) => boolean;
  editable: boolean;
  editorContentRef?: MutableRefObject<(() => unknown) | null>;
  editorSurfaceRef?: RefObject<HTMLElement | null>;
  editorExtensions: Extensions;
  editorId: string;
  editorLifecycleKey: object;
  editorTabIndex?: number;
  initialContent: Content | undefined;
  onContentChange?: (
    readContent: () => unknown,
    transaction?: import("@tiptap/pm/state").Transaction,
  ) => void;
  onCrossEditorDatabaseDrop?: (input: { payload: BlockDragPayload; pos: number }) => boolean;
  onEditorReady?: (editor: Editor | null) => void;
  onEmbedPage?: import("../../lib/editor-types").EditorResourceLink;
  onOpenPage?: (pageId: string, options?: OpenPageOptions) => void;
  onMoveToTitle?: () => boolean;
  setPasteChoice: (choice: PasteChoiceState | null) => void;
  pageId?: string | null;
};

function isCaretAtDocumentStart(state: EditorState) {
  const { doc, selection } = state;

  return (
    selection instanceof TextSelection &&
    selection.empty &&
    selection.from === Selection.atStart(doc).from
  );
}

function isClickAboveFirstNonTextBlock(view: EditorView, pos: number, event: MouseEvent) {
  const firstNode = view.state.doc.firstChild;

  if (pos !== 0 || !firstNode || firstNode.isTextblock) return false;

  const firstNodeDom = view.nodeDOM(0);

  return (
    firstNodeDom instanceof HTMLElement && event.clientY < firstNodeDom.getBoundingClientRect().top
  );
}

const useEditorInstance = ({
  workspace,
  runtime,
  documentKey,
  dropPageOnDatabase,
  editable,
  editorContentRef,
  editorSurfaceRef,
  editorExtensions,
  editorId,
  editorLifecycleKey,
  editorTabIndex,
  initialContent,
  onContentChange,
  onCrossEditorDatabaseDrop,
  onEditorReady,
  onEmbedPage,
  onMoveToTitle,
  setPasteChoice,
  pageId,
}: UseEditorInstanceOptions) => {
  const [blockDropLine, setBlockDropLine] = useState<BlockDropLine | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const plainPasteRef = useRef(false);

  const onContentChangeRef = useLatestRef(onContentChange);
  const onCrossEditorDatabaseDropRef = useLatestRef(onCrossEditorDatabaseDrop);
  const onEmbedPageRef = useLatestRef(onEmbedPage);
  const onMoveToTitleRef = useLatestRef(onMoveToTitle);
  const editableRef = useLatestRef(editable);
  const dropPageOnDatabaseRef = useLatestRef(dropPageOnDatabase);
  const pageIdRef = useLatestRef(pageId);
  const handleTypedLinkChoiceRef = useLatestRef(
    (view: Parameters<typeof handleTypedLinkChoice>[0], event: KeyboardEvent) =>
      handleTypedLinkChoice(view, event, editable, setPasteChoice),
  );

  const dragDrop = useMemo(
    () =>
      createEditorDragDrop(setBlockDropLine, {
        workspace,
        viewId: editorId,
        deferCrossEditorDatabaseDrop: (_view, payload, pos) =>
          payload.editorId !== editorId &&
          (onCrossEditorDatabaseDropRef.current?.({ payload, pos }) ?? false),
        dropPageOnDatabase: (event) => dropPageOnDatabaseRef.current(event),
        getView: () =>
          editorRef.current && !editorRef.current.isDestroyed ? editorRef.current.view : null,
        insertDraggedPage: (view, event) =>
          insertDraggedDatabasePage(
            view,
            event,
            (embeddedPageId) => onEmbedPageRef.current?.(embeddedPageId),
            pageIdRef.current,
            () => toast.error("You can't embed a page inside itself."),
            (error) =>
              toast.error(error instanceof Error ? error.message : "Could not embed page."),
          ),
        isDraggingPage: (event) => isDraggingPageToEditor(event, workspace),
        isOverDatabaseDrop: (event) => Boolean(getDropDatabaseElement(event)),
        shouldSkipDropLine: shouldSkipEditorDropLine,
        surfaceRef: editorSurfaceRef,
      }),
    [workspace, editorId, editorSurfaceRef],
  );

  const editor = useEditor(
    {
      extensions: editorExtensions,
      immediatelyRender: false,
      content: initialContent,
      editable,
      // ProseMirror updates its own DOM. Keep transactions from rerendering the
      // entire React editor shell; controls subscribe to the editor directly.
      shouldRerenderOnTransaction: false,
      onCreate: ({ editor: currentEditor }) => {
        editorRef.current = currentEditor;
      },
      onUpdate: ({ editor: currentEditor, transaction }) => {
        if (editableRef.current)
          onContentChangeRef.current?.(() => currentEditor.getJSON(), transaction);
      },
      editorProps: {
        attributes: {
          class: "tiptap-editor",
          "aria-label": "Document editor",
          ...(editorTabIndex === undefined ? {} : { tabindex: String(editorTabIndex) }),
        },
        handleDrop: dragDrop.handleDrop,
        handleClick: (view, pos, event) => {
          if (!isClickAboveFirstNonTextBlock(view, pos, event)) return false;

          // StarterKit's gap cursor otherwise turns the editor padding above an
          // atomic first block into an invisible insertion point.
          event.preventDefault();
          view.dom.blur();
          return true;
        },
        handleDOMEvents: {
          ...dragDrop.domEvents,
          mousemove: (_view, event) =>
            event.target instanceof Element &&
            event.target.closest("[data-editor-view-id]")?.getAttribute("data-editor-view-id") !==
              editorId,
          beforeinput: (view, event) =>
            editableRef.current &&
            (handleBlockSelectionBeforeInput(view, event) ||
              handleProtectedStructuralBlockBeforeInput(view, event)),
          keydown: (view, event) => {
            plainPasteRef.current =
              event.shiftKey && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v";
            if (editableRef.current && handleBlockSelectionKeyDown(view, event)) {
              return true;
            }

            if (editableRef.current && handleProtectedStructuralBlockDeleteKey(view, event)) {
              return true;
            }

            if (event.key === "Enter") {
              return handleTypedLinkChoiceRef.current(view, event);
            }

            if (
              event.key === "Backspace" &&
              editableRef.current &&
              isCaretAtDocumentStart(view.state) &&
              onMoveToTitleRef.current?.()
            ) {
              event.preventDefault();
              return true;
            }

            return false;
          },
          cut: (view, event) =>
            editableRef.current &&
            (handleBlockSelectionClipboardMutation(view, event) ||
              handleProtectedStructuralBlockClipboardMutation(view, event)),
          keyup: (view, event) => {
            plainPasteRef.current = false;
            return event.key === " " ? handleTypedLinkChoiceRef.current(view, event) : false;
          },
          blur: () => {
            plainPasteRef.current = false;
            return false;
          },
        },
        handlePaste: (view, event) => {
          if (editableRef.current && handleBlockSelectionClipboardMutation(view, event)) {
            return true;
          }

          if (editableRef.current && handleProtectedStructuralBlockClipboardMutation(view, event)) {
            return true;
          }

          const current = editorRef.current;
          const plain = plainPasteRef.current;
          plainPasteRef.current = false;
          return current ? handleEditorPaste(current, event, plain, setPasteChoice) : false;
        },
        transformPastedHTML: normalizePastedEditorHTML,
      },
    },
    [editorLifecycleKey],
  );

  useEffect(() => {
    dragDrop.bind();
    return () => dragDrop.destroy();
  }, [dragDrop, editor]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editorContentRef) return;
    editorContentRef.current = editor ? () => editor.getJSON() : null;
    return () => {
      editorContentRef.current = null;
    };
  }, [editor, editorContentRef]);

  useEffect(() => {
    onEditorReady?.(editor ?? null);
    return () => {
      onEditorReady?.(null);
    };
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(
      editable && (!workspace.views.has(editorId) || workspace.ownsField(editorId, documentKey)),
      false,
    );
    editor.view.dispatch(
      editor.state.tr.setMeta("editorCapabilities", true).setMeta("addToHistory", false),
    );
  }, [editor, editable, workspace, editorId, documentKey]);

  useEffect(() => {
    if (!editor) return;
    let release: (() => void) | undefined;
    const register = () => {
      release ??= workspace.registerView(editorId, editor, documentKey, runtime);
    };
    editor.on("create", register);
    if (editor.isInitialized) register();
    return () => {
      editor.off("create", register);
      release?.();
    };
  }, [workspace, editor, editorId, documentKey, runtime]);

  return { blockDropLine, editor, surfaceDragHandlers: dragDrop.surfaceProps };
};

const useLatestRef = <T>(value: T) => {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
};

function normalizeEditorContent(content: unknown) {
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (!trimmed) return "";
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return content;
    }
  }
  return content ?? "";
}

const useEditorExtensions = ({
  workspace,
  collaboration,
  collaborationField,
  content,
  createEditorDatabase,
  createEditorMeeting,
  databaseEditorRuntime,
  structuralEditingEnabled,
  onCreatePage,
  onEmbedPage,
  onOpenPage,
  onStructuralInsertionPendingChange,
  workspaceId,
  pageId,
  documentKey,
}: UseEditorExtensionsOptions & { documentKey: string; workspace: EditorWorkspace }) => {
  const [tocItems, setTocItems] = useState<TableOfContentDataItem[]>([]);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const structural = useRef(structuralEditingEnabled);
  structural.current = structuralEditingEnabled;
  const latest = useRef({
    createEditorDatabase,
    createEditorMeeting,
    onCreatePage,
    onEmbedPage,
    onOpenPage,
    onStructuralInsertionPendingChange,
  });
  latest.current = {
    createEditorDatabase,
    createEditorMeeting,
    onCreatePage,
    onEmbedPage,
    onOpenPage,
    onStructuralInsertionPendingChange,
  };
  const document = collaboration?.document;
  const awareness = collaboration?.awareness ?? collaboration?.provider?.awareness;
  const editorExtensions = useMemo<Extensions>(
    () =>
      createBaseExtensions({
        workspace,
        collaboration,
        collaborationField,
        databaseEditorRuntime,
        editable: true,
        structuralEditingEnabled: true,
        isStructuralEditingEnabled: () => structural.current,
        createEditorDatabase: () => latest.current.createEditorDatabase(),
        createEditorMeeting: () => latest.current.createEditorMeeting(),
        onCreatePage: onCreatePage ? () => latest.current.onCreatePage!() : undefined,
        onEmbedPage: (id) => latest.current.onEmbedPage?.(id),
        onOpenPage: (id, options) => latest.current.onOpenPage?.(id, options),
        onStructuralInsertionPendingChange: (pending) =>
          latest.current.onStructuralInsertionPendingChange?.(pending),
        onTocUpdate: (items) =>
          queueMicrotask(() => {
            if (active.current) setTocItems(items);
          }),
        workspaceId,
        pageId,
      }),
    [
      workspace,
      document,
      awareness,
      collaborationField,
      databaseEditorRuntime,
      workspaceId,
      pageId,
    ],
  );

  // Tiptap's Collaboration extension binds to one Y.XmlFragment when the
  // editor is created. Recreate the editor when a meeting switches between
  // notes, summary, and transcript. Page awareness exists before transport
  // startup; meeting awareness comes from its provider.
  const collaborationPresenceKey =
    (collaboration?.awareness || collaboration?.provider?.awareness) && collaboration.user
      ? "presence"
      : "content-only";
  const editorLifecycleKey = useMemo(
    () => ({ document, awareness, collaborationField, documentKey, collaborationPresenceKey }),
    [document, awareness, collaborationField, documentKey, collaborationPresenceKey],
  );
  const initialContent = collaboration ? undefined : (normalizeEditorContent(content) as Content);

  return {
    editorExtensions,
    editorLifecycleKey,
    initialContent,
    tocItems,
  };
};

const useDatabaseEditorRuntime = (editable: boolean) => {
  const editorRuntimeRef = useRef({
    editable,
    listeners: new Set<() => void>(),
  });

  const databaseEditorRuntime = useMemo<DatabaseBlockEditorRuntime>(
    () => ({
      getEditable: () => editorRuntimeRef.current.editable,
      subscribe: (listener) => {
        editorRuntimeRef.current.listeners.add(listener);
        return () => editorRuntimeRef.current.listeners.delete(listener);
      },
    }),
    [],
  );

  useEffect(() => {
    editorRuntimeRef.current.editable = editable;
    editorRuntimeRef.current.listeners.forEach((listener) => listener());
  }, [editable]);
  return { databaseEditorRuntime, editorRuntimeRef };
};

type UseEditorRuntimeOptions = Omit<
  UseEditorInstanceOptions,
  "databaseEditorRuntime" | "editorExtensions" | "editorLifecycleKey" | "initialContent"
> &
  Omit<UseEditorExtensionsOptions, "databaseEditorRuntime"> & { databaseEditable: boolean };

export function useEditorRuntime(options: UseEditorRuntimeOptions) {
  const { databaseEditorRuntime } = useDatabaseEditorRuntime(options.databaseEditable);
  const { editorExtensions, editorLifecycleKey, initialContent, tocItems } = useEditorExtensions({
    ...options,
    databaseEditorRuntime,
  });
  const instance = useEditorInstance({
    ...options,
    databaseEditorRuntime,
    editorExtensions,
    editorLifecycleKey,
    initialContent,
  });
  return { ...instance, tocItems };
}
