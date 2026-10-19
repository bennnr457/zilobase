import { Hono } from "hono";
import {
  readDatabaseBootstrap,
  readDatabaseExport,
  readDatabaseMutationHistory,
  readDatabaseRecordWindow,
} from "../../services/databases/read/operations";
import { ServerOperationError } from "../../services/operations/context";
import { pinnedResourceMiddleware } from "../auth/pinned-resource-middleware";
import { serverOperationContext } from "../http/operation-context";
import { httpRouteErrorResponse } from "../http/route-error";

import { getDatabaseRealtimeWebSocketUrl } from "@zilobase/runtime-adapter/capabilities";
import {
  getEffectiveDatabaseAccessForRecord,
  isDatabasePublishedInWorkspace,
} from "../../services/access/effective-access";
import { getWorkspaceRealtimeAccessExpiration } from "../../services/access/principal-access";
import { getDatabaseRecord } from "../../services/databases/access/database-access";
import {
  DatabaseViewQueryChangedError,
  DatabaseWindowStaleError,
  getAuthorizedDatabaseSourceIds,
} from "../../services/databases/read/service";
import {
  createDatabaseRealtimeTicket,
  DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX,
  DATABASE_REALTIME_PROTOCOL,
  verifyDatabaseRealtimeTicket,
} from "../../services/databases/realtime/tickets";
import type { AppBindings } from "../../shared/contracts/http";
import { readJsonBody } from "../http/request";

export const databaseReadRoutes = new Hono<AppBindings>();
databaseReadRoutes.onError((error, c) => {
  if (error instanceof ServerOperationError) return httpRouteErrorResponse(c, error)!;
  throw error;
});
const resourceWorkspace = pinnedResourceMiddleware((id) =>
  getDatabaseRecord(id, { includeDeleted: true }),
);

function integerQuery(value: string | undefined, fallback?: number) {
  if (value === undefined) return fallback;
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

databaseReadRoutes.get("/:id/bootstrap", resourceWorkspace, async (c) =>
  c.json(
    await readDatabaseBootstrap(serverOperationContext(c), {
      databaseId: c.req.param("id"),
      includeDeleted: c.req.query("includeDeleted") === "1",
      viewId: c.req.query("viewId") || undefined,
    }),
  ),
);
databaseReadRoutes.get("/:id/export", resourceWorkspace, async (c) =>
  c.json(
    await readDatabaseExport(serverOperationContext(c), {
      databaseId: c.req.param("id"),
      dataSourceId: c.req.query("dataSourceId") || undefined,
      rowLimit: integerQuery(c.req.query("rowLimit")),
    }),
  ),
);
databaseReadRoutes.get("/:id/data-sources/:dataSourceId/records", resourceWorkspace, async (c) => {
  try {
    return c.json(
      await readDatabaseRecordWindow(serverOperationContext(c), {
        databaseId: c.req.param("id"),
        dataSourceId: c.req.param("dataSourceId"),
        includeDeleted: c.req.query("includeDeleted") === "1",
        expectedQueryHash: c.req.query("expectedQueryHash") ?? "",
        snapshot: c.req.query("snapshot") || undefined,
        offset: integerQuery(c.req.query("offset"), 0),
        limit: integerQuery(c.req.query("limit")),
        viewId: c.req.query("viewId") || undefined,
      }),
    );
  } catch (error) {
    if (error instanceof DatabaseViewQueryChangedError)
      return c.json({ code: error.code, error: error.message }, 409);
    if (error instanceof DatabaseWindowStaleError)
      return c.json(
        { code: error.code, currentSnapshot: error.currentSnapshot, error: error.message },
        409,
      );
    throw error;
  }
});
databaseReadRoutes.get("/:id/mutations", resourceWorkspace, async (c) =>
  c.json(
    await readDatabaseMutationHistory(serverOperationContext(c), {
      databaseId: c.req.param("id"),
      afterVersion: integerQuery(c.req.query("afterVersion")) ?? Number.NaN,
      limit: integerQuery(c.req.query("limit")),
    }),
  ),
);

databaseReadRoutes.post("/:id/realtime-ticket", resourceWorkspace, async (c) => {
  const user = c.get("user") ?? null;

  if (!user || c.get("authMethod") !== "session") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getDatabaseRecord(c.req.param("id"));
  if (!record) return c.json({ error: "Database not found" }, 404);

  const accessLevel = await getEffectiveDatabaseAccessForRecord(record, user.id);
  if (accessLevel === "none") return c.json({ error: "Forbidden" }, 403);

  const body = await readJsonBody(c.req);
  const hasRefreshToken = Boolean(body && typeof body === "object" && "token" in body);
  const refreshToken =
    hasRefreshToken && typeof (body as { token?: unknown }).token === "string"
      ? (body as { token: string }).token
      : undefined;
  let sessionId: string | undefined;

  if (hasRefreshToken && (!refreshToken || refreshToken.length > 8 * 1024)) {
    return c.json({ error: "Invalid realtime session" }, 400);
  }

  if (refreshToken) {
    try {
      const previous = await verifyDatabaseRealtimeTicket(refreshToken, c.env);
      if (previous.databaseId !== record.id || previous.user.id !== user.id) {
        return c.json({ error: "Invalid realtime session" }, 401);
      }
      sessionId = previous.sessionId;
    } catch {
      return c.json({ error: "Invalid realtime session" }, 401);
    }
  }

  const ticket = await createDatabaseRealtimeTicket(
    {
      canEdit: accessLevel === "edit" || accessLevel === "full",
      databaseId: record.id,
      sourceIds: await getAuthorizedDatabaseSourceIds(record, user.id),
      sessionId,
      user: {
        email: user.email,
        id: user.id,
        image: user.image,
        name: user.name || user.email,
      },
      version: record.version,
      workspaceId: record.workspaceId,
    },
    c.env,
    {
      maxExpiresAt: await getWorkspaceRealtimeAccessExpiration(record.workspaceId, user.id),
    },
  );
  const websocketUrl = new URL(getDatabaseRealtimeWebSocketUrl(c.req.raw));
  websocketUrl.searchParams.set("database", record.id);

  return c.json({
    ...ticket,
    databaseId: record.id,
    version: record.version,
    websocketProtocols: [
      DATABASE_REALTIME_PROTOCOL,
      `${DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX}${ticket.token}`,
    ],
    websocketUrl: websocketUrl.toString(),
  });
});

databaseReadRoutes.get("/:id/published", resourceWorkspace, async (c) => {
  const record = await getDatabaseRecord(c.req.param("id"));
  if (!record) return c.json({ published: false }, 404);

  return c.json({
    published: await isDatabasePublishedInWorkspace(record.id, record.workspaceId),
  });
});
