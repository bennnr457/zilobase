import {
  databaseCommandRequestSchema,
  databaseCreationCommandSchema,
  dataSourceCommandSchema,
  hostDatabaseCommandSchema,
} from "@zilobase/features/runtime";
import { Hono, type Context } from "hono";
import { executeDatabaseApplicationCommand } from "../../services/databases/commands/operations";
import { serverOperationContext } from "../http/operation-context";

import { getDatabaseRecord } from "../../services/databases/access/database-access";
import {
  CommandIdReusedError,
  RowMoveConflictError,
} from "../../services/databases/commands/framework";
import {
  recordDatabaseCounter,
  recordDatabaseHistogram,
} from "../../services/databases/observability";
import type { AppBindings } from "../../shared/contracts/http";
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

  const startedAt = performance.now();
  const metricAttributes = {
    operation: request.command.type,
    scope: dataSourceId ? ("source" as const) : ("host" as const),
  };
  try {
    const acknowledgement = await executeDatabaseApplicationCommand(serverOperationContext(c), {
      databaseId,
      dataSourceId,
      request,
    });
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
  const acknowledgement = await executeDatabaseApplicationCommand(serverOperationContext(c), {
    request: { ...request, command },
  });
  return c.json(acknowledgement, 201);
});
