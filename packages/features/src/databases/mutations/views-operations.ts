import {
  clientDatabaseController,
  type ClientOperationContext,
} from "../../shared/operation-context";
import { clientMutation, runClientMutation } from "../../shared/operation-mutation";
import type { DatabaseViewEntity } from "../core/entities";
import type { ConfigurationChange } from "../interactions/configuration";
export type UpdateDatabaseViewInput = {
  configuration?: ConfigurationChange[];
  databaseId: string;
  databaseViewId: string;
  name?: string;
  type?: string;
};
export type AddDatabaseViewInput = {
  config?: unknown;
  databaseId: string;
  dataSourceId: string;
  name?: string;
  type?: string;
};
export type DeleteDatabaseViewInput = {
  databaseId: string;
  databaseViewId: string;
};

export type UpdateDatabaseViewResult = DatabaseViewEntity;
export function updateDatabaseView(
  context: ClientOperationContext,
  input: UpdateDatabaseViewInput,
): Promise<UpdateDatabaseViewResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async ({ databaseId, databaseViewId, ...patch }: UpdateDatabaseViewInput) => {
        const ack = await controller.execute({
          command: {
            patch,
            type: "view.update",
            viewId: databaseViewId,
          },
          databaseId,
        });
        return ack.result as DatabaseViewEntity;
      },
    });
  });
}

export type AddDatabaseViewResult = DatabaseViewEntity;
export function addDatabaseView(
  context: ClientOperationContext,
  input: AddDatabaseViewInput,
): Promise<AddDatabaseViewResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async ({
        config,
        databaseId,
        dataSourceId,
        name,
        type,
      }: AddDatabaseViewInput) => {
        const ack = await controller.execute({
          command: {
            afterViewId: null,
            beforeViewId: null,
            config: config ?? null,
            dataSourceId,
            name: name?.trim() || "Table",
            type: "view.create",
            viewType: type?.trim() || "table",
          },
          databaseId,
        });
        return ack.result as DatabaseViewEntity;
      },
    });
  });
}

export type DeleteDatabaseViewResult = {
  viewId: string;
};
export function deleteDatabaseView(
  context: ClientOperationContext,
  input: DeleteDatabaseViewInput,
): Promise<DeleteDatabaseViewResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async ({ databaseId, databaseViewId }: DeleteDatabaseViewInput) => {
        const ack = await controller.execute({
          command: { type: "view.delete", viewId: databaseViewId },
          databaseId,
        });
        return ack.result as {
          viewId: string;
        };
      },
    });
  });
}
