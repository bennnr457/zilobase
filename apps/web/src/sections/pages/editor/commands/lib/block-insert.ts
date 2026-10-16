import { createPositionAnchor } from "../../operations/lib/position-anchor";
import type { Content, Editor } from "@tiptap/core";
import { Effect } from "effect";

import type { SlashCommandItem } from "../../extensions/components/slash-command";
import { createDatabaseSetupBlockContent } from "@/sections/databases/blocks/lib/database-block-content";

import type { DragHandleTarget } from "../../toolbar/lib/toolbar";

function getColumnCount(title: string) {
  const match = title.match(/^([2-4]) Columns$/);

  return match ? Number(match[1]) : null;
}

function convertedTextBlock(
  title: string,
  node: { isTextblock: boolean; textContent: string },
): Content {
  const text = node.isTextblock && node.textContent.trim() ? node.textContent : "";
  const content = text ? [{ type: "text", text }] : undefined;
  if (title === "Text") return { type: "paragraph", content };
  const levels: Record<string, number> = {
    "Heading 1": 1,
    "Heading 2": 2,
    "Heading 3": 3,
  };
  return { type: "heading", attrs: { level: levels[title] ?? 3 }, content };
}

export function blockContentForConversion(
  item: SlashCommandItem,
  node: { isTextblock: boolean; textContent: string },
): Content | null {
  const content = blockContentForItem(item);
  if (!content) return null;
  if (item.title === "Text" || item.title.startsWith("Heading"))
    return convertedTextBlock(item.title, node);
  return content;
}

function blockContentForItem(
  item: SlashCommandItem,
  attrs?: { databaseId?: string; meetingId?: string },
): Content | null {
  const columnCount = getColumnCount(item.title);

  if (columnCount) {
    return {
      type: "columnBlock",
      content: Array.from({ length: columnCount }, () => ({
        type: "column",
        content: [{ type: "paragraph" }],
      })),
    };
  }

  switch (item.title) {
    case "Text":
      return { type: "paragraph" };
    case "Heading 1":
      return { type: "heading", attrs: { level: 1 } };
    case "Heading 2":
      return { type: "heading", attrs: { level: 2 } };
    case "Heading 3":
      return { type: "heading", attrs: { level: 3 } };
    case "Bullet List":
      return {
        type: "bulletList",
        content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
      };
    case "Numbered List":
      return {
        type: "orderedList",
        content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
      };
    case "Task List":
      return {
        type: "taskList",
        content: [{ type: "taskItem", content: [{ type: "paragraph" }] }],
      };
    case "Quote":
      return {
        type: "blockquote",
        content: [{ type: "paragraph" }],
      };
    case "Code Block":
      return { type: "codeBlock" };
    case "Image":
      return { type: "imageBlock" };
    case "Video":
      return { type: "videoBlock" };
    case "Embed":
      return { type: "embedBlock" };
    case "YouTube":
      return { type: "embedBlock", attrs: { provider: "youtube" } };
    case "Figma":
      return { type: "embedBlock", attrs: { provider: "figma" } };
    case "Excalidraw":
      return { type: "embedBlock", attrs: { provider: "excalidraw" } };
    case "Miro":
      return { type: "embedBlock", attrs: { provider: "miro" } };
    case "File":
      return { type: "fileBlock" };
    case "Bookmark":
      return { type: "bookmarkBlock" };
    case "Page":
      return { type: "pageBlock" };
    case "Link to page":
      return { type: "pageBlock", attrs: { openPicker: true } };
    case "Toggle":
      return {
        type: "details",
        content: [
          {
            type: "detailsSummary",
            content: [{ type: "text", text: "Toggle" }],
          },
          {
            type: "detailsContent",
            content: [{ type: "paragraph" }],
          },
        ],
      };
    case "Divider":
      return [{ type: "horizontalRule" }, { type: "paragraph" }];
    case "Table":
      return {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: Array.from({ length: 3 }, () => ({
              type: "tableHeader",
              content: [{ type: "paragraph" }],
            })),
          },
          ...Array.from({ length: 2 }, () => ({
            type: "tableRow",
            content: Array.from({ length: 3 }, () => ({
              type: "tableCell",
              content: [{ type: "paragraph" }],
            })),
          })),
        ],
      };
    case "Database":
      return attrs?.databaseId ? createDatabaseSetupBlockContent(attrs.databaseId) : null;
    case "Meeting notes":
      return attrs?.meetingId
        ? { type: "meetingBlock", attrs: { meetingId: attrs.meetingId } }
        : null;
    default:
      return { type: "paragraph" };
  }
}

function selectInsertedBlock(editor: Editor, pos: number, item: SlashCommandItem) {
  if (item.title === "Database") {
    editor
      .chain()
      .focus()
      .setTextSelection(pos + 2)
      .run();
    return;
  }

  if (item.title === "Divider") {
    editor
      .chain()
      .focus()
      .setTextSelection(pos + 2)
      .run();
    return;
  }

  editor
    .chain()
    .focus()
    .setTextSelection(pos + 1)
    .run();
}

export type StructuralInsertionPendingChange = (pending: boolean) => void;

type StructuralInsertionOptions<T> = {
  create: (() => Promise<T | null>) | undefined;
  insert: (created: T) => void;
  onPendingChange?: StructuralInsertionPendingChange;
};

function structuralInsertion<T>({
  create,
  insert,
  onPendingChange,
}: StructuralInsertionOptions<T>) {
  return Effect.gen(function* () {
    if (!create) return null;
    // This callback stays outside the cleanup region, as in the Promise workflow.
    yield* Effect.try({ try: () => onPendingChange?.(true), catch: (error) => error });
    return yield* Effect.gen(function* () {
      const created = yield* Effect.tryPromise({ try: create, catch: (error) => error });
      if (created !== null) {
        yield* Effect.try({ try: () => insert(created), catch: (error) => error });
      }
      return created;
    }).pipe(
      // Capture the body failure so a throwing finalizer retains JavaScript finally precedence.
      Effect.exit,
      Effect.ensuring(Effect.sync(() => onPendingChange?.(false))),
      Effect.flatMap((exit) => exit),
    );
  });
}

export async function runStructuralInsertion<T>(input: StructuralInsertionOptions<T>) {
  return Effect.runPromise(structuralInsertion(input));
}

export async function insertCreatedBlock<T>({
  editor,
  range,
  create,
  content,
  onPendingChange,
}: {
  editor: Editor;
  range: { from: number; to: number };
  create: (() => Promise<T | null>) | undefined;
  content: (created: T) => Content;
  onPendingChange?: StructuralInsertionPendingChange;
}) {
  const from = createPositionAnchor(editor, range.from),
    to = createPositionAnchor(editor, range.to);
  const expected = editor.state.doc.slice(range.from, range.to);
  return Effect.runPromise(
    structuralInsertion({
      create,
      onPendingChange,
      insert: (created) => {
        const start = from.resolve(),
          end = to.resolve();
        if (
          editor.isDestroyed ||
          !editor.isEditable ||
          start === null ||
          end === null ||
          end < start
        )
          return;
        if (!editor.state.doc.slice(start, end).eq(expected)) return;
        editor
          .chain()
          .focus(undefined, { scrollIntoView: false })
          .replaceBlocksRange({ from: start, to: end }, content(created))
          .run();
      },
    }).pipe(
      Effect.exit,
      Effect.ensuring(
        Effect.sync(() => {
          from.dispose();
          to.dispose();
        }),
      ),
      Effect.flatMap((exit) => exit),
    ),
  );
}

export async function insertBlockFromPlus(
  editor: Editor,
  target: DragHandleTarget,
  item: SlashCommandItem,
  options: {
    onCreateDatabase?: () => Promise<string | null>;
    onCreateMeeting?: () => Promise<string | null>;
    onStructuralInsertionPendingChange?: StructuralInsertionPendingChange;
  } = {},
) {
  const isEmptyTextBlock = target.node.isTextblock && target.node.content.size === 0;
  const anchor = createPositionAnchor(editor, target.pos);

  const insert = (content: Content | null) => {
    const pos = anchor.resolve();
    if (
      !content ||
      editor.isDestroyed ||
      !editor.isEditable ||
      pos === null ||
      !editor.state.doc.nodeAt(pos)?.eq(target.node)
    ) {
      return;
    }

    if (isEmptyTextBlock) {
      editor
        .chain()
        .focus()
        .replaceBlocksRange({ from: pos, to: pos + target.node.nodeSize }, content)
        .run();
      selectInsertedBlock(editor, pos, item);
      return;
    }

    const insertPos = pos + target.node.nodeSize;

    editor.chain().focus().insertBlocksAt(insertPos, content).run();
    selectInsertedBlock(editor, insertPos, item);
  };

  return Effect.runPromise(
    Effect.gen(function* () {
      if (item.title === "Database" || item.title === "Meeting notes") {
        const database = item.title === "Database";
        const outcome = yield* structuralInsertion({
          create: database ? options.onCreateDatabase : options.onCreateMeeting,
          insert: (id) =>
            insert(blockContentForItem(item, database ? { databaseId: id } : { meetingId: id })),
          onPendingChange: options.onStructuralInsertionPendingChange,
        }).pipe(Effect.exit);
        // Resource insertion crossed an await before anchor cleanup, even for missing
        // callbacks or synchronous failures. Keep that boundary without nesting runners.
        yield* Effect.promise(() => Promise.resolve());
        yield* outcome;
        return;
      }

      yield* Effect.try({ try: () => insert(blockContentForItem(item)), catch: (error) => error });
    }).pipe(
      // Preserve finally precedence if disposing the anchor throws after a body failure.
      Effect.exit,
      Effect.ensuring(Effect.sync(() => anchor.dispose())),
      Effect.flatMap((exit) => exit),
    ),
  );
}
