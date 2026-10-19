import {
  clientDatabaseController,
  type ClientOperationContext,
} from "../../shared/operation-context";
import { clientMutation, runClientMutation } from "../../shared/operation-mutation";
import { resolveDataSourceCommandScope } from "./scope";
export type DatabaseStoredTemplate = {
  archivedAt: string | null;
  id: string;
  name: string;
  template: unknown;
};
export type DatabaseTemplateScope = {
  databaseId: string;
  hostDatabaseId?: string;
};
function defineCreateDatabaseTemplateMutation(context: ClientOperationContext) {
  return databaseTemplateMutation(
    context,
    (
      input: DatabaseTemplateScope & {
        name: string;
        template: unknown;
      },
    ) => ({
      name: input.name,
      template: input.template,
      type: "template.create" as const,
    }),
  );
}
export type CreateDatabaseTemplateInput = Parameters<
  NonNullable<ReturnType<typeof defineCreateDatabaseTemplateMutation>["mutationFn"]>
>[0];
export type CreateDatabaseTemplateResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineCreateDatabaseTemplateMutation>["mutationFn"]>>
>;
export function createDatabaseTemplate(
  context: ClientOperationContext,
  input: CreateDatabaseTemplateInput,
): Promise<CreateDatabaseTemplateResult> {
  return runClientMutation(context, input, defineCreateDatabaseTemplateMutation);
}

function defineUpdateDatabaseTemplateMutation(context: ClientOperationContext) {
  return databaseTemplateMutation(
    context,
    (
      input: DatabaseTemplateScope & {
        patch: unknown;
        templateId: string;
      },
    ) => ({
      patch: input.patch,
      templateId: input.templateId,
      type: "template.update" as const,
    }),
  );
}
export type UpdateDatabaseTemplateInput = Parameters<
  NonNullable<ReturnType<typeof defineUpdateDatabaseTemplateMutation>["mutationFn"]>
>[0];
export type UpdateDatabaseTemplateResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdateDatabaseTemplateMutation>["mutationFn"]>>
>;
export function updateDatabaseTemplate(
  context: ClientOperationContext,
  input: UpdateDatabaseTemplateInput,
): Promise<UpdateDatabaseTemplateResult> {
  return runClientMutation(context, input, defineUpdateDatabaseTemplateMutation);
}

function defineArchiveDatabaseTemplateMutation(context: ClientOperationContext) {
  return databaseTemplateMutation(
    context,
    (
      input: DatabaseTemplateScope & {
        templateId: string;
      },
    ) => ({
      templateId: input.templateId,
      type: "template.archive" as const,
    }),
  );
}
export type ArchiveDatabaseTemplateInput = Parameters<
  NonNullable<ReturnType<typeof defineArchiveDatabaseTemplateMutation>["mutationFn"]>
>[0];
export type ArchiveDatabaseTemplateResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineArchiveDatabaseTemplateMutation>["mutationFn"]>>
>;
export function archiveDatabaseTemplate(
  context: ClientOperationContext,
  input: ArchiveDatabaseTemplateInput,
): Promise<ArchiveDatabaseTemplateResult> {
  return runClientMutation(context, input, defineArchiveDatabaseTemplateMutation);
}

function defineRestoreDatabaseTemplateMutation(context: ClientOperationContext) {
  return databaseTemplateMutation(
    context,
    (
      input: DatabaseTemplateScope & {
        templateId: string;
      },
    ) => ({
      templateId: input.templateId,
      type: "template.restore" as const,
    }),
  );
}
export type RestoreDatabaseTemplateInput = Parameters<
  NonNullable<ReturnType<typeof defineRestoreDatabaseTemplateMutation>["mutationFn"]>
>[0];
export type RestoreDatabaseTemplateResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineRestoreDatabaseTemplateMutation>["mutationFn"]>>
>;
export function restoreDatabaseTemplate(
  context: ClientOperationContext,
  input: RestoreDatabaseTemplateInput,
): Promise<RestoreDatabaseTemplateResult> {
  return runClientMutation(context, input, defineRestoreDatabaseTemplateMutation);
}

function databaseTemplateMutation<
  TInput extends DatabaseTemplateScope,
  TCommand extends
    | {
        name: string;
        template: unknown;
        type: "template.create";
      }
    | {
        patch: unknown;
        templateId: string;
        type: "template.update";
      }
    | {
        templateId: string;
        type: "template.archive" | "template.restore";
      },
>(context: ClientOperationContext, command: (input: TInput) => TCommand) {
  const controller = clientDatabaseController(context);
  const { queryClient } = context;
  return clientMutation({
    mutationFn: async (input: TInput) => {
      const scope = resolveDataSourceCommandScope(
        queryClient,
        controller.sessionId,
        input.databaseId,
        input.hostDatabaseId,
      );
      const ack = await controller.execute({
        command: command(input),
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      });
      return ack.result as DatabaseStoredTemplate;
    },
  });
}
