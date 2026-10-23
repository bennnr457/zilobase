import "@/styles/global.css";
import "@/styles/app.css";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Node } from "@tiptap/core";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { BlockSelection } from "@/sections/pages/editor/extensions/lib/block-selection";
import { useDatabaseMarquee } from "@/sections/databases/views/shared/hooks/use-database-marquee";

// Exercise the production selection controllers across a real ProseMirror atom
// boundary without requiring database transport or the application shell.
function Records({ editor, node }: ReactNodeViewProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [selectedRowIds, setSelectedRowIds] = useState(new Set<string>());
  const rowIds = ["one", "two", "three"];
  useDatabaseMarquee({
    surfaceRef,
    enabled: editor.isEditable,
    scope: node.attrs.id,
    rowIds,
    selectedRowIds,
    setSelectedRowIds,
  });
  return (
    <NodeViewWrapper data-type="databaseBlock" contentEditable={false}>
      <div ref={surfaceRef} className="database-table-wrap" style={{ margin: "12px 0" }}>
        <div className="database-table-scroll" role="grid" tabIndex={0}>
          <div className="database-table-scroll-content">
            <div style={{ height: 36 }}>Database {node.attrs.id}</div>
            {rowIds.map((id) => (
              <div
                key={id}
                data-database-row-id={id}
                data-row-selected={selectedRowIds.has(id) ? "true" : undefined}
                style={{ height: 40, borderBottom: "1px solid #aaa" }}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${id}`}
                  checked={selectedRowIds.has(id)}
                  onChange={() =>
                    setSelectedRowIds((previous) => {
                      const next = new Set(previous);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                />
                Record {id}
              </div>
            ))}
            <div style={{ height: 36 }}>New page</div>
          </div>
        </div>
        {selectedRowIds.size ? (
          <button style={{ position: "absolute" }} onClick={() => setSelectedRowIds(new Set())}>
            {selectedRowIds.size} selected
          </button>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}
const database = Node.create({
  name: "databaseBlock",
  group: "block",
  atom: true,
  addAttributes: () => ({ id: { default: "first" } }),
  renderHTML: () => ["div", { "data-type": "databaseBlock" }],
  addNodeView: () => ReactNodeViewRenderer(Records, { stopEvent: () => true }),
});

function Pane({ id }: { id: string }) {
  const editor = useEditor({
    extensions: [StarterKit, database, BlockSelection],
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before database" }] },
        { type: "databaseBlock" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Audience" }] },
        { type: "paragraph", content: [{ type: "text", text: "Next block" }] },
        { type: "databaseBlock", attrs: { id: "second" } },
        { type: "paragraph", content: [{ type: "text", text: "After database" }] },
      ],
    },
    editorProps: { attributes: { class: "tiptap-editor" } },
    onCreate: ({ editor }) => Object.assign(window, { [id]: editor }),
  });
  return (
    <section data-testid={id} style={{ width: "50%", height: 650, overflow: "auto" }}>
      <div data-editor-surface style={{ position: "relative", padding: "60px 80px" }}>
        <EditorContent editor={editor} />
      </div>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(
  <div style={{ display: "flex" }}>
    <Pane id="main" />
    <Pane id="side" />
  </div>,
);
