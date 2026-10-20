"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
  type HTMLAttributes,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { closeHistory } from "@tiptap/pm/history";
import type { AppSearchResult } from "@zilobase/features/search";
import { PageDatabaseSearchPopover } from "@/components/navigation/components/page-database-search-popover";
import { Button } from "@/components/ui/button";
import { ChatbotScrollButton } from "../../chat/components/chatbot-scroll-control";
import { mentionAtCaret } from "../lib/mentions";
import {
  PromptEditableContext,
  promptDocument,
  promptExtensions,
  promptItems,
  promptText,
} from "@/sections/pages/editor/extensions/components/ai-prompt-document";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ui/prompt-input";

type ChatbotComposerProps = {
  isSidebar: boolean;
  onSubmit: (message: PromptInputMessage) => void | Promise<void>;
  onTextChange: (text: string) => void;
  text: string;
  workspaceId: string | null;
  attachments: AppSearchResult[];
  onAttachmentsChange: (items: AppSearchResult[]) => void;
  disabled?: boolean;
  children?: ReactNode;
  onStop?: () => void;
};
type Mention = { from: number; to: number; query: string };
const placeholder = "Ask about your workspace · @ to attach pages or databases";
const itemKey = (item: AppSearchResult) => `${item.type}:${item.id}`;
const itemKeys = (items: AppSearchResult[]) => items.map(itemKey).join("|");

export function ChatbotComposer(props: ChatbotComposerProps) {
  const { onSubmit, text, workspaceId, attachments, disabled, children, onStop } = props;
  const latest = useRef(props);
  latest.current = props;
  const input = useRef<HTMLElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const composing = useRef(false);
  const [mention, setMention] = useState<Mention | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const publishSelection = (editor: Editor) => {
    const { selection } = editor.state;
    const before = selection.$from.parent.textBetween(
      0,
      selection.$from.parentOffset,
      "\n",
      (node) => (node.type.name === "hardBreak" ? "\n" : "\ufffc"),
    );
    const found =
      !composing.current && selection.empty ? mentionAtCaret(before, before.length) : null;
    const next = found
      ? { from: selection.$from.start() + found.start, to: selection.from, query: found.query }
      : null;
    setMention((current) =>
      current?.from === next?.from && current?.to === next?.to && current?.query === next?.query
        ? current
        : next,
    );
  };
  const editor = useEditor(
    {
      extensions: [
        ...promptExtensions(workspaceId),
        Placeholder.configure({ placeholder, showOnlyWhenEditable: false }),
      ],
      content: promptDocument(text, attachments),
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-label": "Ask AI message",
          "aria-multiline": "true",
          "data-slot": "input-group-control",
          class:
            "ai-prompt-editor min-h-16 max-h-48 w-full min-w-0 overflow-y-auto bg-transparent px-2 py-2 text-sm whitespace-pre-wrap wrap-break-word outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50 md:text-xs/relaxed",
        },
        handlePaste: (_view, event) => {
          const content = event.clipboardData?.getData("text/plain");
          if (content === undefined) return false;
          event.preventDefault();
          const nodes: JSONContent[] = [];
          content
            .replace(/\r\n?/g, "\n")
            .split("\n")
            .forEach((line, index) => {
              if (index) nodes.push({ type: "hardBreak" });
              if (line) nodes.push({ type: "text", text: line });
            });
          return editorRef.current?.commands.insertContent(nodes) ?? true;
        },
      },
      onSelectionUpdate: ({ editor }) => publishSelection(editor),
      onUpdate: ({ editor }) => {
        latest.current.onTextChange(promptText(editor));
        const items = promptItems(editor);
        if (itemKeys(items) !== itemKeys(latest.current.attachments))
          latest.current.onAttachmentsChange(items);
        setDismissed(false);
        publishSelection(editor);
      },
    },
    [workspaceId],
  );

  // External drafts and restored/current-page context use the same inline nodes.
  // Normal typing keeps the document and caret intact; no text/HTML round trips.
  useLayoutEffect(() => {
    if (!editor) return;
    editorRef.current = editor;
    input.current = editor.view.dom;
    editor.setEditable(!disabled, false);
    editor.view.dom.setAttribute("aria-disabled", String(!!disabled));
    let disposed = false;
    queueMicrotask(() => {
      if (disposed || editor.isDestroyed) return;
      if (promptText(editor) !== text) {
        editor
          .chain()
          .setMeta("addToHistory", false)
          .setContent(promptDocument(text, attachments), { emitUpdate: false })
          .run();
      } else {
        const allowed = new Set(attachments.map(itemKey));
        const transaction = editor.state.tr;
        const removals: { from: number; to: number }[] = [];
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === "promptContext" && !allowed.has(itemKey(node.attrs.item)))
            removals.push({ from: pos, to: pos + node.nodeSize });
        });
        removals.reverse().forEach(({ from, to }) => transaction.delete(from, to));
        if (removals.length)
          editor.view.dispatch(
            transaction.setMeta("addToHistory", false).setMeta("preventUpdate", true),
          );
        const existing = new Set(promptItems(editor).map(itemKey));
        const missing = attachments.filter((item) => !existing.has(itemKey(item)));
        if (missing.length)
          editor
            .chain()
            .command(({ tr }) => {
              tr.setMeta("addToHistory", false).setMeta("preventUpdate", true);
              return true;
            })
            .insertContentAt(
              editor.state.selection.from,
              missing.map((item) => ({ type: "promptContext", attrs: { item } })),
            )
            .run();
      }
    });
    return () => {
      disposed = true;
    };
  }, [editor, text, attachments, disabled]);

  const open = !!mention && !dismissed && !disabled;
  const choose = (item: AppSearchResult) => {
    if (!editor || !mention || disabled) return;
    if (attachments.length >= 20 && !attachments.some((entry) => itemKey(entry) === itemKey(item)))
      return;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        closeHistory(tr);
        return true;
      })
      .insertContentAt(
        { from: mention.from, to: mention.to },
        { type: "promptContext", attrs: { item } },
      )
      .run();
    setDismissed(true);
  };
  return (
    <div className="relative z-10 -mx-4 grid shrink-0 gap-3 bg-surface-canvas px-4 pt-3 pb-4 md:mx-0 md:px-0 md:pb-6">
      <ChatbotScrollButton />
      <div className="mx-auto w-full max-w-full">
        <div className="max-h-[min(40vh,20rem)] overflow-y-auto overscroll-contain">{children}</div>
        <PageDatabaseSearchPopover
          workspaceId={workspaceId}
          query={mention?.query ?? ""}
          inputRef={input}
          side="top"
          open={open}
          onOpenChange={(value) => {
            if (!value) setDismissed(true);
          }}
          onSelect={choose}
        >
          {(inputProps) => (
            <PromptInput onSubmit={onSubmit}>
              <textarea name="message" hidden readOnly value={text} disabled={disabled} />
              <PromptEditableContext.Provider value={!disabled}>
                <PromptEditor
                  editor={editor}
                  pickerProps={inputProps}
                  className="w-full min-w-0"
                  onCompositionStartCapture={() => {
                    composing.current = true;
                  }}
                  onCompositionEndCapture={() => {
                    composing.current = false;
                    requestAnimationFrame(() => {
                      if (editor && !editor.isDestroyed) publishSelection(editor);
                    });
                  }}
                  onKeyDownCapture={(event) => {
                    if ((event.target as HTMLElement).closest("button")) return;
                    if (composing.current || event.nativeEvent.isComposing) return;
                    inputProps.onKeyDown?.(event);
                    if (event.defaultPrevented) {
                      event.stopPropagation();
                      return;
                    }
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!disabled) event.currentTarget.closest("form")?.requestSubmit();
                    }
                  }}
                />
              </PromptEditableContext.Provider>
              <PromptInputFooter>
                <PromptInputTools>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    aria-label="Add context"
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    onClick={() => {
                      if (!editor) return;
                      if (!mention) {
                        const { $from } = editor.state.selection;
                        const last = $from.parent.textBetween(
                          Math.max(0, $from.parentOffset - 1),
                          $from.parentOffset,
                          "",
                          " ",
                        );
                        editor
                          .chain()
                          .focus()
                          .insertContent(last && !/\s/.test(last) ? " @" : "@")
                          .run();
                      } else editor.commands.focus();
                      setDismissed(false);
                    }}
                  >
                    @ Add context
                  </Button>
                </PromptInputTools>
                {onStop ? (
                  <Button type="button" variant="outline" size="sm" onClick={onStop}>
                    Stop
                  </Button>
                ) : (
                  <PromptInputSubmit disabled={!text.trim() || disabled} />
                )}
              </PromptInputFooter>
            </PromptInput>
          )}
        </PageDatabaseSearchPopover>
      </div>
    </div>
  );
}

function PromptEditor({
  editor,
  pickerProps,
  ...props
}: ComponentProps<typeof EditorContent> & { pickerProps: HTMLAttributes<HTMLElement> }) {
  useLayoutEffect(() => {
    if (!editor) return;
    for (const name of [
      "aria-controls",
      "aria-expanded",
      "aria-autocomplete",
      "aria-activedescendant",
    ] as const) {
      const value = pickerProps[name];
      if (value === undefined) editor.view.dom.removeAttribute(name);
      else editor.view.dom.setAttribute(name, String(value));
    }
  }, [editor, pickerProps]);
  return <EditorContent editor={editor} {...props} />;
}
