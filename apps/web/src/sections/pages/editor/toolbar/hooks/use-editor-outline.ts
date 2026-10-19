import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";

export type EditorOutlineItem = {
  id: string;
  kind: "heading" | "database" | "meeting";
  resourceId: string | null;
  pos: number;
  level: number;
  originalLevel: number;
  textContent: string;
};

export function getEditorOutline(editor: Editor): EditorOutlineItem[] {
  const items: EditorOutlineItem[] = [];
  const levels: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    const heading = node.type.name === "heading";
    const database = node.type.name === "databaseBlock";
    const meeting = node.type.name === "meetingBlock";
    if (!heading && !database && !meeting) return;
    const originalLevel = heading ? Number(node.attrs.level) : 2;
    if (heading && (originalLevel > 4 || !node.textContent.trim())) return;
    while (levels.length && levels.at(-1)! >= originalLevel) levels.pop();
    levels.push(originalLevel);
    const resourceId = database ? node.attrs.databaseId : meeting ? node.attrs.meetingId : null;
    items.push({
      id: heading
        ? (node.attrs["data-toc-id"] ?? `heading-${pos}`)
        : `${node.type.name}-${resourceId ?? "empty"}-${pos}`,
      kind: heading ? "heading" : database ? "database" : "meeting",
      resourceId: typeof resourceId === "string" ? resourceId : null,
      pos,
      level: levels.length,
      originalLevel,
      textContent: heading ? node.textContent : database ? "Database" : "Meeting",
    });
  });
  return items;
}

export function useEditorOutline(editor: Editor | null) {
  return (
    useEditorState({
      editor,
      selector: ({ editor }) => (editor ? getEditorOutline(editor) : []),
    }) ?? []
  );
}

export function jumpToEditorOutlineItem(editor: Editor, id: string) {
  if (editor.isDestroyed) return;
  const item = getEditorOutline(editor).find((item) => item.id === id);
  if (!item) return;
  const dom = editor.view.nodeDOM(item.pos);
  if (!(dom instanceof HTMLElement)) return;
  dom.scrollIntoView({ block: "center", behavior: "smooth" });
  if (item.kind === "heading" && editor.isEditable) {
    editor.commands.setTextSelection(Math.min(item.pos + 1, editor.state.doc.content.size));
    editor.view.focus();
  }
}
