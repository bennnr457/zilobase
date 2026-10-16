import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CheckSquare,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  ListCollapse,
  List,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
  Table2,
  Underline,
} from "@/components/icons";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Icon } from "@/components/icons";

export type ToolbarAction =
  | "toggleBold"
  | "toggleItalic"
  | "toggleStrike"
  | "toggleCode"
  | "toggleUnderline"
  | "toggleHeading"
  | "toggleBulletList"
  | "toggleOrderedList"
  | "toggleTaskList"
  | "toggleBlockquote"
  | "toggleCodeBlock"
  | "setDetails"
  | "setHorizontalRule"
  | "insertTable"
  | "setTextAlign";

export type ToolbarAttrs = {
  level?: 1 | 2 | 3;
  align?: "left" | "center" | "right";
};

export type ToolbarItem = {
  label: string;
  icon: Icon;
  isActive: () => string | Record<string, unknown>;
  action: ToolbarAction;
  attrs?: ToolbarAttrs;
};

export type { ColorToken } from "@/lib/color-tokens";

export type DragHandleTarget = {
  node: ProseMirrorNode;
  pos: number;
};

export type RunToolbarCommand = (action: ToolbarAction, attrs?: ToolbarAttrs) => void;

export type EditorControlProps = {
  editor: Editor | null;
};

export const toolbarGroups: ToolbarItem[][] = [
  [
    {
      label: "Bold",
      icon: Bold,
      isActive: () => "bold",
      action: "toggleBold",
    },
    {
      label: "Italic",
      icon: Italic,
      isActive: () => "italic",
      action: "toggleItalic",
    },
    {
      label: "Strike",
      icon: Strikethrough,
      isActive: () => "strike",
      action: "toggleStrike",
    },
    {
      label: "Inline code",
      icon: Code,
      isActive: () => "code",
      action: "toggleCode",
    },
    {
      label: "Underline",
      icon: Underline,
      isActive: () => "underline",
      action: "toggleUnderline",
    },
  ],
  [
    {
      label: "Heading 1",
      icon: Heading1,
      isActive: () => ({ heading: { level: 1 } }),
      action: "toggleHeading",
      attrs: { level: 1 },
    },
    {
      label: "Heading 2",
      icon: Heading2,
      isActive: () => ({ heading: { level: 2 } }),
      action: "toggleHeading",
      attrs: { level: 2 },
    },
    {
      label: "Heading 3",
      icon: Heading3,
      isActive: () => ({ heading: { level: 3 } }),
      action: "toggleHeading",
      attrs: { level: 3 },
    },
    {
      label: "Bullet list",
      icon: List,
      isActive: () => "bulletList",
      action: "toggleBulletList",
    },
    {
      label: "Ordered list",
      icon: ListOrdered,
      isActive: () => "orderedList",
      action: "toggleOrderedList",
    },
    {
      label: "Task list",
      icon: CheckSquare,
      isActive: () => "taskList",
      action: "toggleTaskList",
    },
    {
      label: "Blockquote",
      icon: Quote,
      isActive: () => "blockquote",
      action: "toggleBlockquote",
    },
    {
      label: "Code block",
      icon: Code2,
      isActive: () => "codeBlock",
      action: "toggleCodeBlock",
    },
    {
      label: "Toggle",
      icon: ListCollapse,
      isActive: () => "details",
      action: "setDetails",
    },
    {
      label: "Divider",
      icon: Minus,
      isActive: () => "horizontalRule",
      action: "setHorizontalRule",
    },
    {
      label: "Table",
      icon: Table2,
      isActive: () => "table",
      action: "insertTable",
    },
  ],
  [
    {
      label: "Align left",
      icon: AlignLeft,
      isActive: () => ({ textAlign: "left" }),
      action: "setTextAlign",
      attrs: { align: "left" },
    },
    {
      label: "Align center",
      icon: AlignCenter,
      isActive: () => ({ textAlign: "center" }),
      action: "setTextAlign",
      attrs: { align: "center" },
    },
    {
      label: "Align right",
      icon: AlignRight,
      isActive: () => ({ textAlign: "right" }),
      action: "setTextAlign",
      attrs: { align: "right" },
    },
  ],
];

const toolbarCommands: Record<
  ToolbarAction,
  (chain: ReturnType<Editor["chain"]>, attrs?: ToolbarAttrs) => void
> = {
  toggleBold: (chain) => chain.toggleBold().run(),
  toggleItalic: (chain) => chain.toggleItalic().run(),
  toggleStrike: (chain) => chain.toggleStrike().run(),
  toggleCode: (chain) => chain.toggleCode().run(),
  toggleUnderline: (chain) => chain.toggleUnderline().run(),
  toggleHeading: (chain, attrs) => chain.toggleHeading({ level: attrs?.level ?? 1 }).run(),
  toggleBulletList: (chain) => chain.toggleBulletList().run(),
  toggleOrderedList: (chain) => chain.toggleOrderedList().run(),
  toggleTaskList: (chain) => chain.toggleTaskList().run(),
  toggleBlockquote: (chain) => chain.toggleBlockquote().run(),
  toggleCodeBlock: (chain) => chain.toggleCodeBlock().run(),
  setDetails: (chain) => chain.setDetails().run(),
  setHorizontalRule: (chain) => chain.setHorizontalRule().run(),
  insertTable: (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  setTextAlign: (chain, attrs) => chain.setTextAlign(attrs?.align ?? "left").run(),
};

export const runToolbarCommand = (
  editor: Editor | null,
  action: ToolbarAction,
  attrs?: ToolbarAttrs,
) => {
  if (!editor) return;
  toolbarCommands[action](editor.chain().focus(), attrs);
};
