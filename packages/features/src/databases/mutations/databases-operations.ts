import type { NavDelta } from "../../pages/navigation-model";
import { pagesQueryKey } from "../../pages/queries";
import {
  clientDatabaseController,
  type ClientOperationContext,
} from "../../shared/operation-context";
import { clientMutation, runClientMutation } from "../../shared/operation-mutation";
import type { DatabaseHostEntity, DataSourceEntity } from "../core/entities";
import type { ConfigurationChange } from "../interactions/configuration";
export type CreateDatabaseInput = {
  name?: string;
  workspaceId: string;
  pageId?: string;
  standalone?: boolean;
  teamspaceId?: string | null;
};
export type CreateDatabaseResponse = {
  activeDataSource: DataSourceEntity | null;
  database: DatabaseHostEntity;
  navDelta: NavDelta;
};
export type UpdateDatabaseInput = {
  databaseId: string;
  pageId?: string | null;
  expectedPageId?: string | null;
  name?: string;
  configuration?: ConfigurationChange[];
};
export type SetDatabaseFavoriteInput = {
  databaseId: string;
  isFavorite: boolean;
};
export type SetDatabaseFavoriteResponse = {
  databaseId: string;
  isFavorite: boolean;
  workspaceId: string;
};
function defineCreateDatabaseMutation(context: ClientOperationContext) {
  const controller = clientDatabaseController(context);
  return clientMutation({
    mutationFn: async (input: CreateDatabaseInput) => {
      const ack = await controller.execute({
        databaseId: input.workspaceId,
        command: {
          ...input,
          type: "database.create",
          name: input.name ?? "New database",
          standalone: input.standalone ?? false,
        },
      });
      return ack.result as CreateDatabaseResponse;
    },
  });
}
export type CreateDatabaseResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineCreateDatabaseMutation>["mutationFn"]>>
>;
export function createDatabase(
  context: ClientOperationContext,
  input: CreateDatabaseInput,
): Promise<CreateDatabaseResult> {
  return runClientMutation(context, input, defineCreateDatabaseMutation);
}

function defineUpdateDatabaseMutation(context: ClientOperationContext) {
  const controller = clientDatabaseController(context);
  const { queryClient } = context;
  return clientMutation({
    mutationFn: async ({ databaseId, ...patch }: UpdateDatabaseInput) => {
      const ack = await controller.execute({
        command: { patch, type: "database.update" },
        databaseId,
      });
      return ack.result as DatabaseHostEntity;
    },
    onSuccess: async (result, input) => {
      if (input.pageId !== undefined) {
        // Placement membership changes on relocation; ordinary metadata edits stay sparse.
        await queryClient
          .invalidateQueries({ queryKey: pagesQueryKey(result.workspaceId) })
          .catch(() => {});
      }
    },
  });
}
export type UpdateDatabaseResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdateDatabaseMutation>["mutationFn"]>>
>;
export function updateDatabase(
  context: ClientOperationContext,
  input: UpdateDatabaseInput,
): Promise<UpdateDatabaseResult> {
  return runClientMutation(context, input, defineUpdateDatabaseMutation);
}

export type DeleteDatabaseResult = {
  database: DatabaseHostEntity | null;
  deletedDatabaseIds: string[];
  deletedPageIds: string[];
};
export type RestoreDatabaseResult = {
  database: DatabaseHostEntity;
  restoredDatabaseIds: string[];
  restoredPageIds: string[];
};
function defineDeleteDatabaseMutation(context: ClientOperationContext) {
  const controller = clientDatabaseController(context);
  return clientMutation({
    mutationFn: async (databaseId: string) =>
      (await controller.execute({ databaseId, command: { type: "database.archive" } }))
        .result as DeleteDatabaseResult,
  });
}
export type DeleteDatabaseInput = Parameters<
  NonNullable<ReturnType<typeof defineDeleteDatabaseMutation>["mutationFn"]>
>[0];
export function deleteDatabase(
  context: ClientOperationContext,
  input: DeleteDatabaseInput,
): Promise<DeleteDatabaseResult> {
  return runClientMutation(context, input, defineDeleteDatabaseMutation);
}

function defineRestoreDatabaseMutation(context: ClientOperationContext) {
  const controller = clientDatabaseController(context);
  return clientMutation({
    mutationFn: async (databaseId: string) =>
      (await controller.execute({ databaseId, command: { type: "database.restore" } }))
        .result as RestoreDatabaseResult,
  });
}
export type RestoreDatabaseInput = Parameters<
  NonNullable<ReturnType<typeof defineRestoreDatabaseMutation>["mutationFn"]>
>[0];
export function restoreDatabase(
  context: ClientOperationContext,
  input: RestoreDatabaseInput,
): Promise<RestoreDatabaseResult> {
  return runClientMutation(context, input, defineRestoreDatabaseMutation);
}

function defineSetDatabaseFavoriteMutation(context: ClientOperationContext) {
  const controller = clientDatabaseController(context);
  return clientMutation({
    mutationFn: async ({ databaseId, isFavorite }: SetDatabaseFavoriteInput) =>
      (
        await controller.execute({
          databaseId,
          command: { type: "database.favorite", favorite: isFavorite },
        })
      ).result as SetDatabaseFavoriteResponse,
  });
}
export type SetDatabaseFavoriteResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineSetDatabaseFavoriteMutation>["mutationFn"]>>
>;
export function setDatabaseFavorite(
  context: ClientOperationContext,
  input: SetDatabaseFavoriteInput,
): Promise<SetDatabaseFavoriteResult> {
  return runClientMutation(context, input, defineSetDatabaseFavoriteMutation);
}
