import { Extension, Node, type Editor, type JSONContent } from "@tiptap/core";
import { history, undo, redo, closeHistory } from "@tiptap/pm/history";
import { createContext, useContext } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import type { AppSearchResult } from "@zilobase/features/search";
import { ContextAttachment } from "@/sections/ai/attachments/components/context-attachment";

export const PromptEditableContext = createContext(true);

function ContextPill({ node, extension, editor, deleteNode }: ReactNodeViewProps) {
  const editable = useContext(PromptEditableContext);
  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      className="mx-0.5 inline-flex max-w-full align-middle"
      data-ai-inline-mention={`${node.attrs.item.type}:${node.attrs.item.id}`}
    >
      <ContextAttachment
        item={node.attrs.item}
        workspaceId={extension.options.workspaceId}
        onRemove={() => {
          if (editor.isEditable) {
            editor.view.dispatch(closeHistory(editor.state.tr));
            deleteNode();
            editor.commands.focus();
          }
        }}
        disabled={!editable}
      />
    </NodeViewWrapper>
  );
}

export const PromptContext = Node.create<{ workspaceId: string | null }>({
  name: "promptContext",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addOptions: () => ({ workspaceId: null }),
  addAttributes: () => ({ item: { default: null } }),
  // Only the authorized picker/selected-source state creates references.
  parseHTML: () => [],
  renderHTML: ({ node }) => ["span", { "data-prompt-context": "" }, `@${node.attrs.item.title}`],
  renderText: ({ node }) => `@${node.attrs.item.title}`,
  addNodeView: () => ReactNodeViewRenderer(ContextPill),
  addKeyboardShortcuts() {
    const remove = (backwards: boolean) => {
      const { selection } = this.editor.state;
      if (!selection.empty) return false;
      const adjacent = backwards ? selection.$from.nodeBefore : selection.$from.nodeAfter;
      if (adjacent?.type.name !== this.name) return false;
      const range = {
        from: backwards ? selection.from - adjacent.nodeSize : selection.from,
        to: backwards ? selection.from : selection.from + adjacent.nodeSize,
      };
      this.editor.view.dispatch(closeHistory(this.editor.state.tr.delete(range.from, range.to)));
      return true;
    };
    return { Backspace: () => remove(true), Delete: () => remove(false) };
  },
});

const PromptDoc = Node.create({ name: "doc", topNode: true, content: "paragraph+" });
const PromptParagraph = Node.create({
  name: "paragraph",
  group: "block",
  content: "inline*",
  parseHTML: () => [{ tag: "p" }],
  renderHTML: () => ["p", 0],
});
const PromptText = Node.create({ name: "text", group: "inline" });
const PromptBreak = Node.create({
  name: "hardBreak",
  inline: true,
  group: "inline",
  selectable: false,
  parseHTML: () => [{ tag: "br" }],
  renderHTML: () => ["br"],
  renderText: () => "\n",
  addKeyboardShortcuts() {
    return { "Shift-Enter": () => this.editor.commands.insertContent({ type: this.name }) };
  },
});
const PromptHistory = Extension.create({
  name: "promptHistory",
  addProseMirrorPlugins: () => [history()],
  addKeyboardShortcuts() {
    return {
      "Mod-z": () => undo(this.editor.state, this.editor.view.dispatch),
      "Mod-Shift-z": () => redo(this.editor.state, this.editor.view.dispatch),
      "Mod-y": () => redo(this.editor.state, this.editor.view.dispatch),
    };
  },
});

export function promptExtensions(workspaceId: string | null) {
  return [
    PromptDoc,
    PromptParagraph,
    PromptText,
    PromptBreak,
    PromptHistory,
    PromptContext.configure({ workspaceId }),
  ];
}

export function promptDocument(text: string, items: AppSearchResult[]): JSONContent {
  const content: JSONContent[] = items.map((item) => ({ type: "promptContext", attrs: { item } }));
  text.split("\n").forEach((line, index) => {
    if (index) content.push({ type: "hardBreak" });
    if (line) content.push({ type: "text", text: line });
  });
  return { type: "doc", content: [{ type: "paragraph", content }] };
}

export function promptText(editor: Editor) {
  return editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n", (node) =>
    node.type.name === "hardBreak" ? "\n" : "",
  );
}

/** Preserve the caret position of each reference in the saved Ask AI message. */
export function promptMessageText(editor: Editor) {
  return editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n", (node) => {
    if (node.type.name === "hardBreak") return "\n";
    if (node.type.name !== "promptContext") return "";
    const item = node.attrs.item as AppSearchResult;
    return `[[${item.type}:${encodeURIComponent(item.id)}]]`;
  });
}

export function promptItems(editor: Editor) {
  const items = new Map<string, AppSearchResult>();
  editor.state.doc.descendants((node) => {
    if (node.type.name === "promptContext") {
      const item = node.attrs.item as AppSearchResult;
      items.set(`${item.type}:${item.id}`, item);
    }
  });
  return [...items.values()];
}
