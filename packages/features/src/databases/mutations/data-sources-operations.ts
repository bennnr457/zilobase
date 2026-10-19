import {
  clientDatabaseController,
  type ClientOperationContext,
} from "../../shared/operation-context";
import { clientMutation, runClientMutation } from "../../shared/operation-mutation";
import type { DatabaseViewEntity, DataSourceEntity } from "../core/entities";
import { type UpdateDatabaseInput } from "./databases-operations";
import { resolveDataSourceCommandScope } from "./scope";
export type LinkDatabaseDataSourceInput = {
  config?: unknown;
  databaseId: string;
  dataSourceId: string;
  name?: string;
  type?: string;
};
export type CreateDatabaseDataSourceInput = {
  config?: unknown;
  databaseId: string;
  name?: string;
  viewName?: string;
  viewType?: string;
};
export type ReplaceDatabaseViewDataSourceInput = {
  databaseId: string;
  databaseViewId: string;
  dataSourceId: string;
};

export type UpdateDataSourceInput = UpdateDatabaseInput;
export type UpdateDataSourceResult = DataSourceEntity;
export function updateDataSource(
  context: ClientOperationContext,
  input: UpdateDataSourceInput,
): Promise<UpdateDataSourceResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    const { queryClient } = context;
    return clientMutation({
      mutationFn: async ({ databaseId: dataSourceId, ...patch }: UpdateDataSourceInput) => {
        const scope = resolveDataSourceCommandScope(
          queryClient,
          controller.sessionId,
          dataSourceId,
        );
        const ack = await controller.execute({
          command: { patch, type: "dataSource.update" },
          databaseId: scope.hostDatabaseId,
          dataSourceId: scope.dataSourceId,
        });
        return ack.result as DataSourceEntity;
      },
    });
  });
}

export type LinkDatabaseDataSourceResult = {
  dataSource: DataSourceEntity;
  view: DatabaseViewEntity;
};
export function linkDatabaseDataSource(
  context: ClientOperationContext,
  input: LinkDatabaseDataSourceInput,
): Promise<LinkDatabaseDataSourceResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async ({
        config,
        databaseId,
        dataSourceId,
        name,
        type,
      }: LinkDatabaseDataSourceInput) => {
        const result = (
          await controller.execute({
            databaseId,
            command: {
              type: "dataSource.link",
              dataSourceId,
              afterId: null,
              beforeId: null,
              view: {
                name: name?.trim() || "",
                type: type?.trim() || "table",
                config: config ?? null,
              },
            },
          })
        ).result as { dataSource: DataSourceEntity; view: DatabaseViewEntity };
        return result;
      },
    });
  });
}

export type CreateDatabaseDataSourceResult = {
  dataSource: DataSourceEntity;
  view: DatabaseViewEntity;
};
export function createDatabaseDataSource(
  context: ClientOperationContext,
  input: CreateDatabaseDataSourceInput,
): Promise<CreateDatabaseDataSourceResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async ({ databaseId, ...input }: CreateDatabaseDataSourceInput) => {
        const ack = await controller.execute({
          command: {
            config: input.config ?? {},
            name: input.name?.trim() || "New data source",
            type: "dataSource.create",
            viewName: input.viewName?.trim() || "Table",
            viewType: input.viewType?.trim() || "table",
          },
          databaseId,
        });
        return ack.result as {
          dataSource: DataSourceEntity;
          view: DatabaseViewEntity;
        };
      },
    });
  });
}

export type ReplaceDatabaseViewDataSourceResult = DatabaseViewEntity;
export function replaceDatabaseViewDataSource(
  context: ClientOperationContext,
  input: ReplaceDatabaseViewDataSourceInput,
): Promise<ReplaceDatabaseViewDataSourceResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async ({
        databaseId,
        databaseViewId,
        dataSourceId,
      }: ReplaceDatabaseViewDataSourceInput) => {
        const ack = await controller.execute({
          command: {
            dataSourceId,
            type: "view.setDataSource",
            viewId: databaseViewId,
          },
          databaseId,
        });
        return ack.result as DatabaseViewEntity;
      },
    });
  });
}

export type UnlinkDatabaseDataSourceInput = Pick<
  LinkDatabaseDataSourceInput,
  "databaseId" | "dataSourceId"
>;
export type UnlinkDatabaseDataSourceResult = DataSourceEntity;
export function unlinkDatabaseDataSource(
  context: ClientOperationContext,
  input: UnlinkDatabaseDataSourceInput,
): Promise<UnlinkDatabaseDataSourceResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async ({ databaseId, dataSourceId }: UnlinkDatabaseDataSourceInput) => {
        const ack = await controller.execute({
          command: { dataSourceId, type: "dataSource.unlink" },
          databaseId,
        });
        return ack.result as DataSourceEntity;
      },
    });
  });
}
