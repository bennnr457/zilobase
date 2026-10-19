import { useEffect, useMemo, useState } from "react";
import { BlockMath } from "@tiptap/extension-mathematics";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type ReactNodeViewProps,
} from "@tiptap/react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { closeEditorHistory } from "../../runtime/lib/editor-history-coordinator";

function useEquation(latex: string) {
  return useMemo(() => {
    if (!latex.trim()) return { html: "", error: "" };
    try {
      return {
        html: katex.renderToString(latex, {
          displayMode: true,
          throwOnError: true,
          trust: false,
          maxSize: 10,
          maxExpand: 1000,
        }),
        error: "",
      };
    } catch (error) {
      return {
        html: "",
        error: error instanceof Error ? error.message : "Invalid TeX equation.",
      };
    }
  }, [latex]);
}

function TexBlockView({ editor, getPos, node }: ReactNodeViewProps) {
  const isEditable = useEditorState({ editor, selector: ({ editor }) => editor.isEditable });
  const latex = typeof node.attrs.latex === "string" ? node.attrs.latex : "";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(latex);
  const [original, setOriginal] = useState(latex);
  const equation = useEquation(latex);
  const preview = useEquation(draft);
  const changedElsewhere = original !== latex;
  const canSave = isEditable && Boolean(draft.trim()) && !preview.error && !changedElsewhere;

  useEffect(() => {
    if (!isEditable) setOpen(false);
  }, [isEditable]);

  const save = () => {
    const pos = getPos();
    if (!canSave || editor.isDestroyed || !editor.isEditable || typeof pos !== "number") return;
    const current = editor.state.doc.nodeAt(pos);
    if (current?.type !== node.type || current.attrs.latex !== original) return;
    if (draft !== latex) {
      closeEditorHistory(editor);
      editor.chain().setNodeSelection(pos).updateBlockMath({ latex: draft }).run();
      closeEditorHistory(editor);
    }
    setOpen(false);
  };

  return (
    <NodeViewWrapper className="tex-block" data-type="block-math" data-latex={latex}>
      <Popover
        open={open && isEditable}
        onOpenChange={(next) => {
          if (next && !editor.isEditable) return;
          if (next) {
            setDraft(latex);
            setOriginal(latex);
          }
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            contentEditable={false}
            disabled={!isEditable}
            aria-label={latex.trim() ? "Edit TeX equation" : "Add a TeX equation"}
            className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-content-secondary transition-colors hover:bg-action-neutral-hover focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent data-[empty=true]:h-10 data-[empty=true]:bg-surface-subtle data-[empty=true]:py-0"
            data-empty={!latex.trim()}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {latex.trim() ? (
              equation.error ? (
                <span className="whitespace-pre-wrap break-all font-mono text-sm">{latex}</span>
              ) : (
                <span
                  className="tex-block-render min-w-0 flex-1 overflow-x-auto text-content-primary"
                  dangerouslySetInnerHTML={{ __html: equation.html }}
                />
              )
            ) : (
              <>
                <span
                  aria-hidden="true"
                  className="flex size-4 shrink-0 items-center font-serif text-xs leading-none"
                >
                  T<span className="relative top-0.5 -mx-px text-[0.625rem]">E</span>X
                </span>
                <span>Add a TeX equation</span>
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          aria-label="TeX equation"
          align="start"
          sideOffset={8}
          className="w-[min(28rem,calc(100vw-2rem))] gap-3 p-3"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <label className="text-sm font-medium">
            TeX equation
            <Textarea
              autoFocus
              aria-label="TeX equation source"
              aria-invalid={Boolean(preview.error)}
              className="mt-2 min-h-24 font-mono"
              placeholder={String.raw`E = mc^2`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  save();
                }
              }}
            />
          </label>
          <div
            aria-label="Equation preview"
            className="tex-block-render min-h-16 overflow-x-auto rounded-md bg-surface-subtle p-3"
          >
            {preview.error ? (
              <p role="alert" className="whitespace-pre-wrap break-words text-content-secondary">
                {preview.error}
              </p>
            ) : preview.html ? (
              <div dangerouslySetInnerHTML={{ __html: preview.html }} />
            ) : (
              <p className="text-content-secondary">Your equation will appear here.</p>
            )}
          </div>
          {changedElsewhere ? (
            <p role="alert" className="text-content-secondary">
              This equation changed while you were editing. Reopen it to load the latest version.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!canSave} onClick={save}>
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}

export const TexBlock = BlockMath.extend({
  draggable: true,
  renderText({ node }) {
    return `$$\n${node.attrs.latex}\n$$`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(TexBlockView);
  },
});
