import { Cause, Effect } from "effect";
import type { EditorResourceReceipt } from "../../lib/editor-types";

type ResourceEditorHistory = {
  canUndo: () => boolean;
  canRedo: () => boolean;
  redo: () => boolean;
  undo: () => boolean;
};

export function createResourceHistoryAction({
  editor,
  onError,
  resource,
  label,
}: {
  editor: ResourceEditorHistory;
  onError: (error: unknown) => void;
  resource: EditorResourceReceipt;
  label: string;
}) {
  let queue: Promise<unknown> = Promise.resolve();
  const run = (direction: "undo" | "redo") => {
    const operation = queue.then(() => {
      const allowed = direction === "undo" ? editor.canUndo : editor.canRedo;
      if (!allowed()) return false;
      return Effect.runPromise(
        Effect.gen(function* () {
          yield* Effect.tryPromise({ try: () => resource[direction](), catch: (error) => error });
          const applied = yield* Effect.try({
            try: () => allowed() && editor[direction](),
            catch: (error) => error,
          });
          if (!applied) {
            yield* Effect.tryPromise({
              try: () => resource[direction === "undo" ? "redo" : "undo"](),
              catch: (error) => error,
            });
            return false;
          }
          return true;
        }).pipe(
          Effect.catchCause((cause) => {
            if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
            return Effect.sync(() => {
              onError(Cause.squash(cause));
              return false;
            });
          }),
        ),
      );
    });
    queue = operation;
    return operation;
  };
  return { label, undo: () => run("undo"), redo: () => run("redo") };
}
