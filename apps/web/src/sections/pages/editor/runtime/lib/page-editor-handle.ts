import { dispatchVerified } from "../../operations/lib/dispatch-verified";
import type { Editor } from "@tiptap/core";
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

    if (!editor || editor.isDestroyed || !input.editable || !editor.isEditable) return false;
    try {
      const next = editor.schema.nodeFromJSON(content);
      if (next.type !== editor.schema.topNodeType) return false;
      next.check();
      const tr = editor.state.tr
        .replaceWith(0, editor.state.doc.content.size, next.content)
        .setMeta("preventUpdate", true);
      if (!dispatchVerified(editor, tr).applied) return false;
    } catch {
      return false;
    }
    input.onContentChange?.(editor.getJSON());
    return true;
  };

  return {
    flushLocal: input.flushLocal,
    isServerConfirmed: input.isServerConfirmed,
    getError: input.getError,
    focus: () => {
      const editor = input.getEditor();
      if (editor && !editor.isDestroyed) editor.view.dom.focus({ preventScroll: true });
    },
    getContentJson: () => {
      const editor = input.getEditor();
      return editor && !editor.isDestroyed ? editor.getJSON() : null;
    },
    isEditable: () => input.editable && Boolean(input.getEditor()?.isEditable),
    isSynchronized: () => input.isSynchronized?.() ?? true,
    setContentJson: (content) => applyContent(content),
  };
}
