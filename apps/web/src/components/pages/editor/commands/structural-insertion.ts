import type { Editor } from "@tiptap/core";
import { Effect } from "effect";
import { createPositionAnchor } from "../operations/position-anchor";
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
  content: (created: T) => import("@tiptap/core").Content;
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
