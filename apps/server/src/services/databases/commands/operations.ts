import {
  databaseCommandRequestSchema,
  databaseCreationCommandSchema,
  databaseLifecycleCommandSchema,
  dataSourceCommandSchema,
  hostDatabaseCommandSchema,
} from "@zilobase/features/runtime";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { canAccessPageInWorkspace } from "../../access/effective-access";
import {
  requireOperationActor,
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import { requireDataSourceAccess, requireDataSourceEditAccess } from "../access/data-source-access";
import { getDatabaseRecord, requireDatabaseEditAccess } from "../access/database-access";
import { dispatchDatabaseCommand } from "./dispatcher";
import { executeDatabaseCommand } from "./framework";
import { authorizeRecordAction } from "./record-actions";

export type ExecuteDatabaseCommandInput = {
  databaseId?: string;
  dataSourceId?: string | null;
  request: unknown;
};

/** Application authorization stays outside receipt transactions, in their existing order. */
export async function executeDatabaseApplicationCommand(
  context: ServerOperationContext,
  input: ExecuteDatabaseCommandInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "databases.write" });
  // HTTP resource middleware resolves pinned tokens before authentication/body validation.
  if (input.databaseId && context.pinnedWorkspaceId) {
    const record = await getDatabaseRecord(input.databaseId, { includeDeleted: true });
    if (!record) throw new ServerOperationError({ error: "Resource not found" }, 404);
    requireOperationWorkspace(context, record.workspaceId);
  }
  const actor = requireOperationActor(context);
  const request = databaseCommandRequestSchema.parse(input.request);
  if (!input.databaseId) {
    const command = databaseCreationCommandSchema.parse(request.command);
    requireOperationWorkspace(context, command.workspaceId);
    return executeDatabaseCommand(
      {
        actorId: actor.id,
        env: context.env,
        request: { ...request, command },
        scope: { databaseId: request.commandId, dataSourceId: null },
      },
      { dispatch: dispatchDatabaseCommand },
    );
  }
  const databaseId = input.databaseId;
  const dataSourceId = input.dataSourceId ?? null;
  if (dataSourceId) dataSourceCommandSchema.parse(request.command);
  else hostDatabaseCommandSchema.parse(request.command);
  const authorize = async () => {
    if (databaseLifecycleCommandSchema.safeParse(request.command).success) return;
    await requireDatabaseEditAccess(databaseId, actor.id);
    if (dataSourceId) {
      const target = await requireDataSourceEditAccess(dataSourceId, actor.id);
      await authorizeRecordAction(request.command, dataSourceId, target.workspaceId, actor.id);
      if (request.command.type === "row.place") {
        const { source, pageId } = request.command;
        if (source) {
          await requireDatabaseEditAccess(source.databaseId, actor.id);
          const origin = await requireDataSourceEditAccess(source.dataSourceId, actor.id);
          if (origin.workspaceId !== target.workspaceId)
            throw new ServiceMutationError("Transfers must stay in the same workspace", 403);
        }
        if (
          pageId &&
          !(await canAccessPageInWorkspace(pageId, target.workspaceId, actor.id, "edit"))
        ) {
          throw new ServiceMutationError("Forbidden", 403);
        }
      }
    } else if (
      request.command.type === "dataSource.link" ||
      request.command.type === "view.setDataSource"
    ) {
      await requireDataSourceAccess(request.command.dataSourceId, actor.id, "view");
    }
  };

  return executeDatabaseCommand(
    { actorId: actor.id, env: context.env, request, scope: { databaseId, dataSourceId } },
    { dispatch: dispatchDatabaseCommand, authorize },
  );
}
