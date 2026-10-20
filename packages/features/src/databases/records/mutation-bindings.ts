import type { changeDatabaseRow } from "../commands";
import type { updateDataSource } from "../mutations/data-sources-operations";
import type {
  addDatabaseProperty,
  updateDatabaseProperty,
} from "../mutations/properties-operations";
import type { addDatabaseRow, updateDatabasePropertyValue } from "../mutations/rows-operations";
import type { addDatabaseView, updateDatabaseView } from "../mutations/views-operations";

type OperationCallback<T extends (...args: never[]) => unknown> = (
  input: Parameters<T>[1],
) => ReturnType<T>;
export type DatabaseRowMutations = {
  addRow: OperationCallback<typeof addDatabaseRow>;
  changeRow: OperationCallback<typeof changeDatabaseRow>;
  updateValue: OperationCallback<typeof updateDatabasePropertyValue>;
};
export type DatabasePropertyMutations = {
  addProperty: OperationCallback<typeof addDatabaseProperty>;
  updateProperty: OperationCallback<typeof updateDatabaseProperty>;
};
export type DatabaseViewMutations = {
  addDatabaseView: OperationCallback<typeof addDatabaseView>;
  updateDatabase: OperationCallback<typeof updateDataSource>;
  updateDatabaseView: OperationCallback<typeof updateDatabaseView>;
};
export type DatabaseMutations = DatabasePropertyMutations &
  DatabaseRowMutations &
  DatabaseViewMutations;

/** Optional caller callbacks and pending state do not require a React mutation object. */
export function observeOperation<TInput, TResult>(
  operation: (input: TInput) => Promise<TResult>,
  input: TInput,
  callbacks?: {
    onSuccess?: (result: TResult) => unknown;
    onError?: (error: Error) => unknown;
    onSettled?: () => unknown;
  },
) {
  void operation(input)
    .then(callbacks?.onSuccess, (error) =>
      callbacks?.onError?.(error instanceof Error ? error : new Error(String(error))),
    )
    .finally(callbacks?.onSettled)
    .catch(() => undefined);
}

/** Select once on admission; a slow acknowledgement must not steal a later selection. */
export function observeDatabaseViewCreation(
  operation: DatabaseViewMutations["addDatabaseView"],
  input: Parameters<DatabaseViewMutations["addDatabaseView"]>[0],
  callbacks: {
    onSuccess?: (view: Awaited<ReturnType<DatabaseViewMutations["addDatabaseView"]>>) => unknown;
    onError?: (error: Error) => unknown;
  },
) {
  let previewed = false;
  observeOperation(
    operation,
    {
      ...input,
      onOptimistic: (view) => {
        previewed = true;
        callbacks.onSuccess?.(view);
      },
    },
    {
      ...callbacks,
      onSuccess: (view) => {
        if (!previewed) callbacks.onSuccess?.(view);
      },
    },
  );
}
