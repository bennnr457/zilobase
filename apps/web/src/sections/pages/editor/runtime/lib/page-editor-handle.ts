import type { Content, Editor } from "@tiptap/core";
import type { PageEditorHandle } from "../components/page-editor-registry";

export function createPageEditorHandle(input: {
  editable: boolean;
  flushLocal?: () => Promise<void>;
  isServerConfirmed?: () => boolean;
  getError?: () => "storage" | "connection" | null;
  getEditor: () => Editor | null;
  isSynchronized?: () => boolean;
  onContentChange?: (content: unknown) => void;
}): PageEditorHandle {
  const applyContent = (content: unknown) => {
    const editor = input.getEditor();

    if (!editor || !input.editable) {
      return false;
    }

    editor.commands.setContent(content as Content);
    input.onContentChange?.(editor.getJSON());
    return true;
  };

  return {
    flushLocal: input.flushLocal,
    isServerConfirmed: input.isServerConfirmed,
    getError: input.getError,
    focus: () => input.getEditor()?.view.dom.focus({ preventScroll: true }),
    getContentJson: () => input.getEditor()?.getJSON() ?? null,
    isEditable: () => input.editable,
    isSynchronized: () => input.isSynchronized?.() ?? true,
    setContentJson: (content) => applyContent(content),
  };
}
