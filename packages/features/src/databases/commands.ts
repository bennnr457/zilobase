import {
  captureClientOperation,
  clientDatabaseController,
  type ClientOperationContext,
} from "../shared/operation-context";
import type { DatabaseRecordEntity } from "./core/entities";
import { submitRecordChange, type ChangeDatabaseRowInput } from "./interactions/record-change";
import type { DatabaseCommandInput } from "./mutations/execute";
export type { ChangeDatabaseRowInput } from "./interactions/record-change";
export {
  DatabaseCommandUnconfirmedError,
  DatabaseReconciliationError,
  OfflineError,
} from "./mutations/execute";
export type { DatabaseCommandInput } from "./mutations/execute";

/** The session controller retains receipt IDs, ordering and reconciliation. */
export async function executeDatabaseCommand(
  context: ClientOperationContext,
  input: DatabaseCommandInput,
) {
  const scope = captureClientOperation(context);
  const controller = clientDatabaseController(context);
  const result =
    input.command.type === "row.change" && input.dataSourceId
      ? await submitRecordChange(controller, {
          ...input.command,
          databaseId: input.databaseId,
          dataSourceId: input.dataSourceId,
        })
      : await controller.execute(input);
  scope.assertCurrent();
  return result;
}

export async function changeDatabaseRow(
  context: ClientOperationContext,
  input: ChangeDatabaseRowInput,
): Promise<DatabaseRecordEntity> {
  const scope = captureClientOperation(context);
  const acknowledgement = await submitRecordChange(clientDatabaseController(context), input);
  scope.assertCurrent();
  return acknowledgement.result as DatabaseRecordEntity;
}
