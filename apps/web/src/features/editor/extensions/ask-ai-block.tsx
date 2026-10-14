import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import type { Editor, Range } from "@tiptap/core";
import { Send, Sparkles, X } from "@/shared/components/icons";
import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AppIconProvider } from "@/shared/components/app-icon-provider";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/features/ai/components/elements/index";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/shared/ui/popover";
import { Textarea } from "@/shared/ui/textarea";
import { isFeatureEnabled } from "@/shared/config/feature-flags";

type AskAiBlockOptions = {
  workspaceId?: string | null;
};

type AskAiAnchorRect = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

type AskAiPopoverProps = {
  anchorRect: AskAiAnchorRect;
  editor: Editor;
  insertPos: number;
  onDone: () => void;
};

function AskAiPopover({ anchorRect, onDone }: AskAiPopoverProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [prompt, setPrompt] = useState("");

  return (
    <Popover
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) onDone();
      }}
      open={isOpen}
    >
      <PopoverAnchor asChild>
        <span
          className="pointer-events-none absolute"
          style={{
            left: anchorRect.left,
            top: anchorRect.top,
            width: Math.max(1, anchorRect.right - anchorRect.left),
            height: Math.max(1, anchorRect.bottom - anchorRect.top),
          }}
        />
      </PopoverAnchor>
      <PopoverContent align="start" className="w-80 p-3" side="bottom">
        <PromptInput
          onSubmit={({ text }) => {
            setPrompt(text);
          }}
        >
          <PromptInputTextarea
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask AI to write in this page..."
            value={prompt}
          />
          <PromptInputFooter>
            <PromptInputSubmit disabled={!prompt.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </PopoverContent>
    </Popover>
  );
}

export function openAskAiPopover({
  editor,
  range,
  workspaceId: _workspaceId,
}: {
  editor: Editor;
  range: Range;
  workspaceId?: string | null;
}) {
  if (!isFeatureEnabled("askAi")) return;

  const coords = editor.view.coordsAtPos(range.from);
  const insertPos = range.from;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  const cleanup = () => {
    root.unmount();
    host.remove();
  };

  editor.chain().focus().deleteRange(range).setTextSelection(insertPos).run();

  root.render(
    <AppIconProvider>
      <AskAiPopover anchorRect={coords} editor={editor} insertPos={insertPos} onDone={cleanup} />
    </AppIconProvider>,
  );
}

function AskAiBlockView({ editor, getPos, node }: ReactNodeViewProps) {
  const [prompt, setPrompt] = useState("");

  const removeBlock = () => {
    if (typeof getPos !== "function") return;
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run();
  };

  if (!isFeatureEnabled("askAi")) {
    return <NodeViewWrapper className="hidden" contentEditable={false} />;
  }

  return (
    <NodeViewWrapper className="ask-ai-block w-full" contentEditable={false}>
      <div className="flex min-h-12 w-full items-end gap-2 rounded-md border bg-surface-canvas px-3 py-2 shadow-sm transition-colors focus-within:border-action-focus-ring focus-within:ring-2 focus-within:ring-action-focus-ring">
        <Sparkles aria-hidden="true" className="mt-2 size-4 shrink-0 text-content-secondary" />
        <Textarea
          autoFocus
          className="max-h-48 min-h-8 flex-1 resize-none border-0 bg-transparent px-0 py-1 text-base leading-6 shadow-none focus-visible:ring-0"
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              removeBlock();
            }
          }}
          placeholder="Ask AI to write in this page..."
          rows={1}
          value={prompt}
        />
        <Button
          aria-label="Remove Ask AI"
          className="size-8 shrink-0 rounded-sm [&_svg]:size-4"
          onClick={removeBlock}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X />
        </Button>
        <Button
          aria-label="Send prompt"
          className="size-8 shrink-0 rounded-sm [&_svg]:size-4"
          disabled={!prompt.trim()}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Send />
        </Button>
      </div>
    </NodeViewWrapper>
  );
}

export const AskAiBlock = Node.create<AskAiBlockOptions>({
  name: "askAiBlock",

  group: "block",

  atom: true,

  selectable: true,

  addOptions() {
    return {
      workspaceId: null,
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='ask-ai-block']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "ask-ai-block" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer((props) => <AskAiBlockView {...props} />);
  },
});
