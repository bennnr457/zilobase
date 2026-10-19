import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { useState } from "react";

import { IconEmojiPicker } from "@/components/ui/icon-emoji-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PageIconDisplay } from "@/sections/pages/appearance/components/page-icon";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: () => ReturnType;
      toggleCallout: () => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

function CalloutView({ editor, node, updateAttributes }: ReactNodeViewProps) {
  const editable = useEditorState({ editor, selector: ({ editor }) => editor.isEditable });
  const [pickerOpen, setPickerOpen] = useState(false);
  const chooseIcon = (icon: string) => {
    if (editor.isDestroyed || !editor.isEditable) return;
    updateAttributes({ icon });
    setPickerOpen(false);
  };

  return (
    <NodeViewWrapper as="aside" className="editor-callout" data-type="callout">
      <div className="editor-callout-icon" contentEditable={false}>
        <Popover open={editable && pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              aria-label="Change callout icon"
              disabled={!editable}
              className="inline-flex items-center justify-center rounded-sm border-0 bg-transparent p-0 focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none"
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <PageIconDisplay
                value={typeof node.attrs.icon === "string" ? node.attrs.icon : "💡"}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="p-0"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <IconEmojiPicker
              allowUpload={false}
              onEmojiSelect={chooseIcon}
              onIconSelect={chooseIcon}
            />
          </PopoverContent>
        </Popover>
      </div>
      <NodeViewContent as="div" className="editor-callout-content" data-callout-content="" />
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      icon: {
        default: "💡",
        parseHTML: (element) => element.getAttribute("data-callout-icon") || "💡",
        renderHTML: (attrs) => ({
          "data-callout-icon": typeof attrs.icon === "string" ? attrs.icon : "💡",
        }),
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'aside[data-type="callout"]', contentElement: "[data-callout-content]" },
      { tag: 'div[data-type="callout"]', contentElement: "[data-callout-content]" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "aside",
      mergeAttributes(HTMLAttributes, { "data-type": "callout", class: "editor-callout" }),
      ["div", { "data-callout-content": "", class: "editor-callout-content" }, 0],
    ];
  },

  // Markdown has no native icon container; retain every child as a quotation.
  renderMarkdown(node, helpers) {
    return helpers
      .renderChildren(node.content ?? [], "\n\n")
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  },

  addCommands() {
    return {
      setCallout:
        () =>
        ({ commands }) =>
          commands.wrapIn(this.name),
      toggleCallout:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () =>
        this.editor.commands.command(({ state, tr, dispatch }) => {
          if (!this.editor.isEditable) return false;
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type !== this.type) continue;
            const after = $from.after(depth);
            const $after = state.doc.resolve(after);
            const paragraph = state.schema.nodes.paragraph;
            if (!$after.parent.canReplaceWith($after.index(), $after.index(), paragraph))
              return false;
            if (dispatch) {
              tr.insert(after, paragraph.create());
              tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1))).scrollIntoView();
            }
            return true;
          }
          return false;
        }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
