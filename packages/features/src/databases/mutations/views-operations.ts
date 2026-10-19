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
function defineUpdateDatabaseViewMutation(context: ClientOperationContext) {
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
}
export type UpdateDatabaseViewResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdateDatabaseViewMutation>["mutationFn"]>>
>;
export function updateDatabaseView(
  context: ClientOperationContext,
  input: UpdateDatabaseViewInput,
): Promise<UpdateDatabaseViewResult> {
  return runClientMutation(context, input, defineUpdateDatabaseViewMutation);
}

function defineAddDatabaseViewMutation(context: ClientOperationContext) {
  const controller = clientDatabaseController(context);
  return clientMutation({
    mutationFn: async ({ config, databaseId, dataSourceId, name, type }: AddDatabaseViewInput) => {
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
}
export type AddDatabaseViewResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineAddDatabaseViewMutation>["mutationFn"]>>
>;
export function addDatabaseView(
  context: ClientOperationContext,
  input: AddDatabaseViewInput,
): Promise<AddDatabaseViewResult> {
  return runClientMutation(context, input, defineAddDatabaseViewMutation);
}

function defineDeleteDatabaseViewMutation(context: ClientOperationContext) {
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
}
export type DeleteDatabaseViewResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineDeleteDatabaseViewMutation>["mutationFn"]>>
>;
export function deleteDatabaseView(
  context: ClientOperationContext,
  input: DeleteDatabaseViewInput,
): Promise<DeleteDatabaseViewResult> {
  return runClientMutation(context, input, defineDeleteDatabaseViewMutation);
}
