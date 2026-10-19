import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { highlightCode } from "@/components/ui/code-block/code-block-highlight";

const mermaidHighlightingKey = new PluginKey<DecorationSet>("mermaidHighlighting");

export function createMermaidHighlightingPlugin() {
  return new Plugin<DecorationSet>({
    key: mermaidHighlightingKey,
    state: {
      init: () => DecorationSet.empty,
      apply: (transaction, previous) =>
        (transaction.getMeta(mermaidHighlightingKey) as DecorationSet | undefined) ??
        previous.map(transaction.mapping, transaction.doc),
    },
    props: {
      decorations: (state) => mermaidHighlightingKey.getState(state),
    },
    view(view) {
      let destroyed = false;
      let revision = 0;

      const refresh = async (currentView: EditorView) => {
        const doc = currentView.state.doc;
        const currentRevision = ++revision;
        const blocks: { source: string; pos: number }[] = [];
        doc.descendants((node, pos) => {
          if (node.type.name === "codeBlock" && node.attrs.language === "mermaid") {
            blocks.push({ source: node.textContent, pos });
          }
        });
        if (!blocks.length && !mermaidHighlightingKey.getState(currentView.state)?.find().length) {
          return;
        }
        const decorations = await Promise.all(
          blocks.map(async ({ source, pos }) => {
            const lines = await highlightCode(source, { language: "mermaid" });
            // Decorations must always address the literal editable source.
            if (lines.map((line) => line.text).join("\n") !== source) return [];
            const tokens: Decoration[] = [];
            let offset = pos + 1;
            for (const line of lines) {
              for (const token of line.tokens) {
                const end = offset + token.content.length;
                if (end > offset && token.color) {
                  tokens.push(
                    Decoration.inline(offset, end, {
                      "data-mermaid-token": "",
                      style: `--editor-mermaid-light:${token.color};--editor-mermaid-dark:${token.colorDark ?? token.color}`,
                    }),
                  );
                }
                offset = end;
              }
              offset += 1;
            }
            return tokens;
          }),
        );
        if (destroyed || revision !== currentRevision || currentView.state.doc !== doc) return;
        currentView.dispatch(
          currentView.state.tr.setMeta(
            mermaidHighlightingKey,
            DecorationSet.create(doc, decorations.flat()),
          ),
        );
      };

      void refresh(view);
      return {
        update(nextView, previousState) {
          if (nextView.state.doc !== previousState.doc) void refresh(nextView);
        },
        destroy() {
          destroyed = true;
        },
      };
    },
  });
}
