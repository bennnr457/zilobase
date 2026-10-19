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
