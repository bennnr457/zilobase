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

export type CreateDatabaseTemplateInput = DatabaseTemplateScope & {
  name: string;
  template: unknown;
};
export type CreateDatabaseTemplateResult = DatabaseStoredTemplate;
export function createDatabaseTemplate(
  context: ClientOperationContext,
  input: CreateDatabaseTemplateInput,
): Promise<CreateDatabaseTemplateResult> {
  return runClientMutation(context, input, (context) =>
    databaseTemplateMutation(context, (input: CreateDatabaseTemplateInput) => ({
      name: input.name,
      template: input.template,
      type: "template.create" as const,
    })),
  );
}

export type UpdateDatabaseTemplateInput = DatabaseTemplateScope & {
  patch: unknown;
  templateId: string;
};
export type UpdateDatabaseTemplateResult = DatabaseStoredTemplate;
export function updateDatabaseTemplate(
  context: ClientOperationContext,
  input: UpdateDatabaseTemplateInput,
): Promise<UpdateDatabaseTemplateResult> {
  return runClientMutation(context, input, (context) =>
    databaseTemplateMutation(context, (input: UpdateDatabaseTemplateInput) => ({
      patch: input.patch,
      templateId: input.templateId,
      type: "template.update" as const,
    })),
  );
}

export type ArchiveDatabaseTemplateInput = DatabaseTemplateScope & {
  templateId: string;
};
export type ArchiveDatabaseTemplateResult = DatabaseStoredTemplate;
export function archiveDatabaseTemplate(
  context: ClientOperationContext,
  input: ArchiveDatabaseTemplateInput,
): Promise<ArchiveDatabaseTemplateResult> {
  return runClientMutation(context, input, (context) =>
    databaseTemplateMutation(context, (input: ArchiveDatabaseTemplateInput) => ({
      templateId: input.templateId,
      type: "template.archive" as const,
    })),
  );
}

export type RestoreDatabaseTemplateInput = DatabaseTemplateScope & {
  templateId: string;
};
export type RestoreDatabaseTemplateResult = DatabaseStoredTemplate;
export function restoreDatabaseTemplate(
  context: ClientOperationContext,
  input: RestoreDatabaseTemplateInput,
): Promise<RestoreDatabaseTemplateResult> {
  return runClientMutation(context, input, (context) =>
    databaseTemplateMutation(context, (input: RestoreDatabaseTemplateInput) => ({
      templateId: input.templateId,
      type: "template.restore" as const,
    })),
  );
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
