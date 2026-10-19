import {
  clientDatabaseController,
  type ClientOperationContext,
} from "../../shared/operation-context";
import { clientMutation, runClientMutation } from "../../shared/operation-mutation";
import type { DatabasePropertyEntity } from "../core/entities";
import type { ConfigurationChange } from "../interactions/configuration";
import { resolveDataSourceCommandScope } from "./scope";
export type AddPropertyInput = {
  config?: unknown;
  databaseId: string;
  name?: string;
  position?: number;
  type?: string;
};
export type ApplyDatabaseTemplateInput = {
  hostDatabaseId?: string;
  config: unknown;
  databaseId: string;
  name: string;
  properties: Array<{
    config?: unknown;
    name: string;
    type: string;
  }>;
  rows: Array<{
    content?: unknown;
    metadata?: unknown;
    title: string;
    values: Array<{
      propertyName: string;
      value: unknown;
    }>;
  }>;
};
export type UpdatePropertyInput = {
  databaseId: string;
  databasePropertyId: string;
  configuration?: ConfigurationChange[];
  name?: string;
  type?: string;
  visible?: boolean;
  width?: number | null;
};
export type DeletePropertyInput = {
  databaseId: string;
  databasePropertyId: string;
};
export type DuplicatePropertyInput = {
  databaseId: string;
  databasePropertyId: string;
  includeValues?: boolean;
};

export type AddDatabasePropertyInput = AddPropertyInput;
export type AddDatabasePropertyResult = DatabasePropertyEntity;
export function addDatabaseProperty(
  context: ClientOperationContext,
  input: AddDatabasePropertyInput,
): Promise<AddDatabasePropertyResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    const { queryClient } = context;
    return clientMutation({
      mutationFn: async ({
        config,
        databaseId,
        name,
        position,
        type,
      }: AddDatabasePropertyInput) => {
        const scope = resolveDataSourceCommandScope(queryClient, controller.sessionId, databaseId);
        const anchors = resolvePropertyCreateAnchors(
          controller.bootstrap(scope.hostDatabaseId)?.properties ?? [],
          scope.dataSourceId,
          position,
        );
        const ack = await controller.execute({
          command: {
            ...anchors,
            config: config ?? null,
            name: name?.trim() || "Property",
            propertyType: type?.trim() || "text",
            type: "property.create",
          },
          databaseId: scope.hostDatabaseId,
          dataSourceId: scope.dataSourceId,
        });
        return ack.result as DatabasePropertyEntity;
      },
    });
  });
}

export type ApplyDatabaseTemplateResult = {
  dataSource: import("../core/entities").DataSourceEntity;
};
export function applyDatabaseTemplate(
  context: ClientOperationContext,
  input: ApplyDatabaseTemplateInput,
): Promise<ApplyDatabaseTemplateResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    const { queryClient } = context;
    return clientMutation({
      mutationFn: async ({ databaseId, hostDatabaseId, ...input }: ApplyDatabaseTemplateInput) => {
        const scope = resolveDataSourceCommandScope(
          queryClient,
          controller.sessionId,
          databaseId,
          hostDatabaseId,
        );
        const ack = await controller.execute({
          command: { ...input, type: "template.apply" },
          databaseId: scope.hostDatabaseId,
          dataSourceId: scope.dataSourceId,
        });
        const result = ack.result as {
          dataSource: import("../core/entities").DataSourceEntity;
        };
        return result;
      },
    });
  });
}

export type UpdateDatabasePropertyInput = UpdatePropertyInput;
export type UpdateDatabasePropertyResult = DatabasePropertyEntity;
export function updateDatabaseProperty(
  context: ClientOperationContext,
  input: UpdateDatabasePropertyInput,
): Promise<UpdateDatabasePropertyResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    const { queryClient } = context;
    return clientMutation({
      mutationFn: async ({
        databaseId,
        databasePropertyId,
        ...patch
      }: UpdateDatabasePropertyInput) => {
        const scope = resolveDataSourceCommandScope(queryClient, controller.sessionId, databaseId);
        const ack = await controller.execute({
          command: {
            patch,
            propertyId: databasePropertyId,
            type: "property.update",
          },
          databaseId: scope.hostDatabaseId,
          dataSourceId: scope.dataSourceId,
        });
        return ack.result as DatabasePropertyEntity;
      },
    });
  });
}

export type DeleteDatabasePropertyInput = DeletePropertyInput;
export type DeleteDatabasePropertyResult = DatabasePropertyEntity;
export function deleteDatabaseProperty(
  context: ClientOperationContext,
  input: DeleteDatabasePropertyInput,
): Promise<DeleteDatabasePropertyResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    const { queryClient } = context;
    return clientMutation({
      mutationFn: async ({ databaseId, databasePropertyId }: DeleteDatabasePropertyInput) => {
        const scope = resolveDataSourceCommandScope(queryClient, controller.sessionId, databaseId);
        const ack = await controller.execute({
          command: {
            propertyId: databasePropertyId,
            type: "property.archive",
          },
          databaseId: scope.hostDatabaseId,
          dataSourceId: scope.dataSourceId,
        });
        return ack.result as DatabasePropertyEntity;
      },
    });
  });
}

export type DuplicateDatabasePropertyInput = DuplicatePropertyInput;
export type DuplicateDatabasePropertyResult = DatabasePropertyEntity;
export function duplicateDatabaseProperty(
  context: ClientOperationContext,
  input: DuplicateDatabasePropertyInput,
): Promise<DuplicateDatabasePropertyResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    const { queryClient } = context;
    return clientMutation({
      mutationFn: async ({
        databaseId,
        databasePropertyId,
        includeValues = false,
      }: DuplicateDatabasePropertyInput) => {
        const scope = resolveDataSourceCommandScope(queryClient, controller.sessionId, databaseId);
        const ack = await controller.execute({
          command: {
            includeValues,
            propertyId: databasePropertyId,
            type: "property.duplicate",
          },
          databaseId: scope.hostDatabaseId,
          dataSourceId: scope.dataSourceId,
        });
        return ack.result as DatabasePropertyEntity;
      },
    });
  });
}

function resolvePropertyCreateAnchors(
  properties: DatabasePropertyEntity[],
  dataSourceId: string,
  requestedPosition?: number,
) {
  const ids = properties
    .filter((property) => property.dataSourceId === dataSourceId)
    .slice()
    .sort((left, right) => left.position - right.position)
    .map(({ id }) => id);
  const position = Math.max(0, Math.min(requestedPosition ?? ids.length, ids.length));
  return {
    afterPropertyId: ids[position - 1] ?? null,
    beforePropertyId: ids[position] ?? null,
  };
}
