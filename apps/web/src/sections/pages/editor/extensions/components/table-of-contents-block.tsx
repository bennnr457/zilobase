import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { useEditorOutline } from "../../toolbar/hooks/use-editor-outline";
import { EditorOutlineLink } from "../../toolbar/components/editor-table-of-contents";

function TableOfContentsBlockView({ editor }: ReactNodeViewProps) {
  const items = useEditorOutline(editor);
  const baseLevel = Math.min(...items.map((item) => item.level));

  return (
    <NodeViewWrapper
      className="table-of-contents-block"
      data-type="tableOfContentsBlock"
      contentEditable={false}
    >
      {items.length ? (
        <nav aria-label="Table of contents" className="flex flex-col items-start">
          {items.map((item) => (
            <EditorOutlineLink
              editor={editor}
              item={item}
              key={item.id}
              className="block w-fit max-w-full rounded-sm py-px text-sm leading-7 text-content-secondary underline decoration-stroke-default underline-offset-4 transition-colors hover:text-content-primary focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none"
              style={{ marginInlineStart: Math.max(0, item.level - baseLevel) * 24 }}
            />
          ))}
        </nav>
      ) : (
        <p className="py-1 text-sm text-content-secondary">
          Add headings to create a table of contents.
        </p>
      )}
    </NodeViewWrapper>
  );
}

export const TableOfContentsBlock = Node.create({
  name: "tableOfContentsBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="tableOfContentsBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": this.name })];
  },

  renderText() {
    return "[Table of contents]";
  },

  renderMarkdown() {
    return "[Table of contents]";
  },

  parseMarkdown() {
    return { type: "tableOfContentsBlock" };
  },

  markdownTokenizer: {
    name: "tableOfContentsBlock",
    level: "block",
    start: (source) => source.toLowerCase().indexOf("[table of contents]"),
    tokenize(source) {
      const match = /^\[table of contents\][ \t]*(?:\r?\n|$)/i.exec(source);
      if (!match) return undefined;
      return { type: "tableOfContentsBlock", raw: match[0] };
    },
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableOfContentsBlockView, {
      stopEvent: ({ event }) =>
        event.target instanceof Element && Boolean(event.target.closest("a")),
    });
  },
});
