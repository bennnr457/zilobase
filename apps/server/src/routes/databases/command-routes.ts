import {
  databaseCommandRequestSchema,
  databaseCreationCommandSchema,
  databaseLifecycleCommandSchema,
  dataSourceCommandSchema,
  hostDatabaseCommandSchema,
} from "@zilobase/features/runtime";
import { Hono, type Context } from "hono";
import { authorizeRecordAction } from "../../services/databases/commands/record-actions";

import { canAccessPageInWorkspace } from "../../services/access/effective-access";
import {
  requireDataSourceAccess,
  requireDataSourceEditAccess,
} from "../../services/databases/access/data-source-access";
import {
  getDatabaseRecord,
  requireDatabaseEditAccess,
} from "../../services/databases/access/database-access";
import { dispatchDatabaseCommand } from "../../services/databases/commands/dispatcher";
import {
  CommandIdReusedError,
  executeDatabaseCommand,
  RowMoveConflictError,
} from "../../services/databases/commands/framework";
import {
  recordDatabaseCounter,
  recordDatabaseHistogram,
} from "../../services/databases/observability";
import type { AppBindings } from "../../shared/contracts/http";
import { ServiceMutationError } from "../../shared/errors/service-mutation-error";
import { rejectMismatchedPinnedWorkspace } from "../auth/oauth/oauth-access";
import { pinnedResourceMiddleware } from "../auth/pinned-resource-middleware";
import { readAuthenticatedJson } from "../http/auth";

export const databaseCommandRoutes = new Hono<AppBindings>();
const databaseWorkspace = pinnedResourceMiddleware((id) =>
  getDatabaseRecord(id, { includeDeleted: true }),
);

async function commandResponse(c: Context<AppBindings>, dataSourceId: string | null) {
  const authenticated = await readAuthenticatedJson(c);
  if (!authenticated.ok) return authenticated.response;

  const request = databaseCommandRequestSchema.parse(authenticated.body);
  if (dataSourceId) dataSourceCommandSchema.parse(request.command);
  else hostDatabaseCommandSchema.parse(request.command);

  const databaseId = c.req.param("id");
  if (!databaseId) return c.json({ error: "Database ID is required" }, 400);
  const authorize = async () => {
    if (databaseLifecycleCommandSchema.safeParse(request.command).success) return;
    await requireDatabaseEditAccess(databaseId, authenticated.user.id);
    if (dataSourceId) {
      const target = await requireDataSourceEditAccess(dataSourceId, authenticated.user.id);
      await authorizeRecordAction(
        request.command,
        dataSourceId,
        target.workspaceId,
        authenticated.user.id,
      );
      if (request.command.type === "row.place") {
        const { source, pageId } = request.command;
        if (source) {
          await requireDatabaseEditAccess(source.databaseId, authenticated.user.id);
          const origin = await requireDataSourceEditAccess(
            source.dataSourceId,
            authenticated.user.id,
          );
          if (origin.workspaceId !== target.workspaceId)
            throw new ServiceMutationError("Transfers must stay in the same workspace", 403);
        }
        if (
          pageId &&
          !(await canAccessPageInWorkspace(
            pageId,
            target.workspaceId,
            authenticated.user.id,
            "edit",
          ))
        ) {
          throw new ServiceMutationError("Forbidden", 403);
        }
      }
    } else if (
      request.command.type === "dataSource.link" ||
      request.command.type === "view.setDataSource"
    ) {
      await requireDataSourceAccess(request.command.dataSourceId, authenticated.user.id, "view");
    }
  };

  const startedAt = performance.now();
  const metricAttributes = {
    operation: request.command.type,
    scope: dataSourceId ? ("source" as const) : ("host" as const),
  };
  try {
    const acknowledgement = await executeDatabaseCommand(
      {
        actorId: authenticated.user.id,
        env: c.env,
        request,
        scope: { databaseId, dataSourceId },
      },
      { dispatch: dispatchDatabaseCommand, authorize },
    );
    recordDatabaseHistogram("acknowledgement_latency_ms", performance.now() - startedAt, {
      ...metricAttributes,
      outcome: "success",
    });
    return c.json(acknowledgement);
  } catch (error) {
    recordDatabaseHistogram("acknowledgement_latency_ms", performance.now() - startedAt, {
      ...metricAttributes,
      outcome: "failure",
    });
    if (error instanceof CommandIdReusedError) {
      return c.json(
        {
          code: error.code,
          commandId: error.commandId,
          error: error.message,
        },
        409,
      );
    }
    if (error instanceof RowMoveConflictError) {
      recordDatabaseCounter("ordering_conflict", {
        ...metricAttributes,
        outcome: "failure",
      });
      return c.json(
        {
          code: error.code,
          error: error.message,
          rowId: error.rowId,
        },
        409,
      );
    }
    throw error;
  }
}

databaseCommandRoutes.post("/:id/commands", databaseWorkspace, (c) => commandResponse(c, null));

databaseCommandRoutes.post("/:id/data-sources/:dataSourceId/commands", databaseWorkspace, (c) => {
  const dataSourceId = c.req.param("dataSourceId");
  return dataSourceId
    ? commandResponse(c, dataSourceId)
    : c.json({ error: "Data source ID is required" }, 400);
});

// A creation command has no existing host; its command ID is its reserved host identity.
databaseCommandRoutes.post("/commands", async (c) => {
  const authenticated = await readAuthenticatedJson(c);
  if (!authenticated.ok) return authenticated.response;
  const request = databaseCommandRequestSchema.parse(authenticated.body);
  const command = databaseCreationCommandSchema.parse(request.command);
  const mismatch = rejectMismatchedPinnedWorkspace(c, command.workspaceId);
  if (mismatch) return mismatch;
  const acknowledgement = await executeDatabaseCommand(
    {
      actorId: authenticated.user.id,
      env: c.env,
      request: { ...request, command },
      scope: { databaseId: request.commandId, dataSourceId: null },
    },
    { dispatch: dispatchDatabaseCommand },
  );
  return c.json(acknowledgement, 201);
});
