import type { Editor } from "@tiptap/core";
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
  Heading4,
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
  level?: 1 | 2 | 3 | 4;
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
      label: "Heading 4",
      icon: Heading4,
      isActive: () => ({ heading: { level: 4 } }),
      action: "toggleHeading",
      attrs: { level: 4 },
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
