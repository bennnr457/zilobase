import {
  createDbClient,
  createAuth,
  getAuthHeaders as getServerAuthHeaders,
  meetingIdFromDocumentName,
  pageIdFromDocumentName,
  runWithDbClient,
  runWithRuntimePorts,
  type AppBindings,
  type AppErrorReport,
  type ZilobaseEditionExtension,
} from "@zilobase/server/adapter-api";
import type { AppPolicy, Ports } from "@zilobase/runtime-ports";
import { CalendarNotificationRoom } from "./features/calendar-realtime/calendar-notification-room";
import {
  routeCalendarRealtimeRequest,
  type CalendarRealtimeRouteEnv,
} from "./features/calendar-realtime/security";
import { PageCollaborationRoom } from "./features/collaboration/page-collaboration-room";
import { MeetingCollaborationRoom } from "./features/collaboration/meeting-collaboration-room";
import {
  routeCollaborationRequest,
  type CollaborationRouteEnv,
} from "./features/collaboration/security";
import { DatabaseCollaborationRoom } from "./features/database-realtime/database-collaboration-room";
import {
  routeDatabaseRealtimeRequest,
  type DatabaseRealtimeRouteEnv,
} from "./features/database-realtime/security";
import {
  routeMeetingAudioRequest,
  type MeetingAudioRouteEnv,
} from "./features/meeting-audio/security";
import { NavigationNotificationRoom } from "./features/navigation-realtime/navigation-notification-room";

import type { WorkerEnvBindings } from "./bindings";
import { createWorkerHandler } from "./handler";
import { createWorkerScheduler } from "./scheduler";
import { createWorkerDatabaseUnavailableResponse } from "./request-error";
import { createWorkerRuntimePorts } from "./runtime-ports";

export { routeCollaborationRequest } from "./features/collaboration/security";
export type { CollaborationRouteEnv } from "./features/collaboration/security";

export {
  DatabaseCollaborationRoom,
  MeetingCollaborationRoom,
  CalendarNotificationRoom,
  NavigationNotificationRoom,
  PageCollaborationRoom,
};

export type FetchableApp = {
  fetch(request: Request, env: Record<string, unknown>, ctx: unknown): Response | Promise<Response>;
};

export type WorkerRuntimeOptions<Env extends WorkerEnvBindings = WorkerEnvBindings> = {
  loadApp: (env: Env, ports: Partial<Ports>) => Promise<FetchableApp>;
  getEditionExtension?: (env: Env) => ZilobaseEditionExtension | undefined;
  reportError?: (env: Env, report: AppErrorReport) => void | Promise<void>;
  reportEvent?: (env: Env, event: string, props?: Record<string, unknown>) => void | Promise<void>;
  demoGuard?: {
    isDemoRequest: (req: Request, env: Env) => boolean;
    isDisabledPath: (pathname: string) => boolean;
    readOnlyResponse: () => Response;
    applyReadRateLimit?: (req: Request, env: Env) => Promise<Response | null>;
  };
  getSessionPolicyDenial?: (args: {
    env: Env;
    request: Request;
    database: unknown;
    session: {
      session: {
        activeOrganizationId?: string | null;
        activeWorkspaceId?: string | null;
        id: string;
      };
      user: { email?: string | null; id: string };
    };
  }) => Promise<{ code: string; message: string; status: number } | null>;
  cors?: { isAllowedOrigin: (env: Env, origin: string) => boolean };
  policy?: AppPolicy;
};

const communityWorkerPolicy: AppPolicy = {
  compression: false,
  registration: "bootstrap",
  webhookHttpDomains: new Set(),
  workspaceSelection: "pinned",
};

export function createWorker<Env extends WorkerEnvBindings = WorkerEnvBindings>(
  opts: WorkerRuntimeOptions<Env>,
): { fetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response> } {
  const policy = opts.policy ?? communityWorkerPolicy;

  let editionExtension: ZilobaseEditionExtension | null | undefined;
  let extensionResolved = false;
  const resolveEditionExtension = (env: Env) => {
    if (!extensionResolved) {
      editionExtension = opts.getEditionExtension?.(env);
      extensionResolved = true;
    }
    return editionExtension;
  };

  const reportError = (env: Env, report: AppErrorReport) => {
    if (opts.reportError) return opts.reportError(env, report);
    console.error(
      JSON.stringify({
        code: report.code,
        event: "worker.app_error",
        method: report.method,
        request_id: report.requestId,
        route: report.route,
        status: report.status,
      }),
    );
  };

  let runtimePorts: Partial<Ports> | null = null;
  const portsFor = (env: Env, execution?: unknown): Partial<Ports> => {
    if (!runtimePorts) {
      runtimePorts = createWorkerRuntimePorts(env, {
        telemetry: {
          reportError: (_runtimeEnv, error, properties) =>
            reportError(env, {
              code: String(properties.code ?? "WORKER_REQUEST_ERROR"),
              error: error instanceof Error ? error : new Error(String(error)),
              method: String(properties.method ?? "UNKNOWN"),
              requestId: String(properties.request_id ?? "unknown"),
              route: String(properties.route_group ?? "/"),
              status: 500,
              userId: null,
              workspaceId: null,
            }),
          reportEvent: opts.reportEvent,
        },
      });
    }
    if (execution && typeof execution === "object" && "waitUntil" in execution) {
      runtimePorts.scheduler = createWorkerScheduler(execution as ExecutionContext);
    }
    return runtimePorts;
  };
  const appHandler = createWorkerHandler<Env, FetchableApp>({
    loadApp: (env) => opts.loadApp(env, portsFor(env)),
  });

  async function fetchApp(request: Request, env: Env, ctx: unknown) {
    return runWithDbRequest(env, () => appHandler.fetch(request, env, ctx));
  }

  async function getCollaborationUserId(request: Request, env: Env) {
    return runWithDbRequest(env, async (database) => {
      const extension = resolveEditionExtension(env);
      const auth = await createAuth(env, request, database, {
        ...(extension ? { editionExtension: extension } : {}),
        policy,
      });
      const session = await auth.api.getSession({
        headers: await getServerAuthHeaders(auth, request.headers),
      });
      if (session?.user && (await sessionPolicyDenial(env, request, database, session)))
        return null;
      return session?.user?.id ?? null;
    });
  }

  async function sessionPolicyDenial(
    env: Env,
    request: Request,
    database: unknown,
    session: {
      session: {
        activeOrganizationId?: string | null;
        activeWorkspaceId?: string | null;
        id: string;
      };
      user: { email?: string | null; id: string };
    },
  ) {
    if (opts.getSessionPolicyDenial) {
      return opts.getSessionPolicyDenial({ database, env, request, session });
    }
    const extension = resolveEditionExtension(env);
    return (
      extension?.assertSession?.({
        authMethod: "session",
        database: database as never,
        request,
        session: {
          ...session.session,
          activeWorkspaceId:
            session.session.activeWorkspaceId ?? session.session.activeOrganizationId ?? null,
        },
        user: session.user,
      }) ?? null
    );
  }

  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
      request = withRequestId(request);
      return runWithRuntimePorts(portsFor(env, ctx), async () => {
        try {
          const pathname = new URL(request.url).pathname;

          if (opts.demoGuard?.isDemoRequest(request, env)) {
            if (opts.demoGuard.isDisabledPath(pathname)) {
              return opts.demoGuard.readOnlyResponse();
            }

            if (request.method === "GET" || request.method === "HEAD") {
              if (!opts.demoGuard.applyReadRateLimit) {
                return fetchApp(request, env, ctx);
              }
              return opts.demoGuard
                .applyReadRateLimit(request, env)
                .then((limited) => limited ?? fetchApp(request, env, ctx));
            }
          }

          if (pathname === "/collaboration") {
            return routeCollaborationRequest(
              request,
              env as unknown as CollaborationRouteEnv,
              (collaborationRequest) => getCollaborationUserId(collaborationRequest, env),
              pageIdFromDocumentName,
              portsFor(env).limits!,
            );
          }

          if (pathname === "/meeting-collaboration") {
            return routeCollaborationRequest(
              request,
              {
                COLLABORATION_RATE_LIMITER: (env as Record<string, unknown>)
                  .COLLABORATION_RATE_LIMITER,
                PAGE_COLLABORATION: (env as Record<string, unknown>).MEETING_COLLABORATION,
              } as unknown as CollaborationRouteEnv,
              (collaborationRequest) => getCollaborationUserId(collaborationRequest, env),
              meetingIdFromDocumentName,
              portsFor(env).limits!,
            );
          }

          if (pathname === "/database-collaboration") {
            return routeDatabaseRealtimeRequest(
              request,
              env as unknown as DatabaseRealtimeRouteEnv,
              portsFor(env).limits!,
            );
          }

          if (pathname === "/meeting-audio") {
            return routeMeetingAudioRequest(
              request,
              env as unknown as MeetingAudioRouteEnv,
              ctx,
              undefined,
              portsFor(env).limits!,
            );
          }

          if (pathname === "/calendar-realtime")
            return routeCalendarRealtimeRequest(
              request,
              env as unknown as CalendarRealtimeRouteEnv,
            );

          return fetchApp(request, env, ctx);
        } catch (error) {
          console.error(
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              event: "worker_request_error",
              method: request.method,
              request_id: request.headers.get("x-zilobase-request-id"),
              route_group: routeGroup(request),
            }),
          );
          const unavailable = createWorkerDatabaseUnavailableResponse(error, request);
          if (unavailable) return unavailable;

          await portsFor(env).telemetry!.error(error, {
            code: "WORKER_REQUEST_ERROR",
            method: request.method,
            request_id: request.headers.get("x-zilobase-request-id"),
            route_group: routeGroup(request),
          });
          await portsFor(env).telemetry!.event("worker_request_error", {
            method: request.method,
            request_id: request.headers.get("x-zilobase-request-id"),
            route_group: routeGroup(request),
          });
          throw error;
        }
      });
    },
  };
}

function routeGroup(request: Request) {
  const [group] = new URL(request.url).pathname.split("/").filter(Boolean);
  return group ? `/${group}` : "/";
}

function withRequestId(request: Request) {
  if (request.headers.has("x-zilobase-request-id")) return request;

  const requestId = request.headers.get("cf-ray");
  if (!requestId) return request;

  const headers = new Headers(request.headers);
  headers.set("x-zilobase-request-id", requestId);
  return new Request(request, { headers });
}

async function runWithDbRequest<Env, T>(env: Env, callback: (database: never) => T): Promise<T> {
  const client = createDbClient(env as never);
  return runWithDbClient(client, () => Promise.resolve(callback(client.db as never)));
}

function getAuthHeaders(headers: Headers) {
  const nextHeaders = new Headers(headers);
  const mobileAuthCookie = nextHeaders.get("x-mobile-auth-cookie")?.trim();

  if (!nextHeaders.has("cookie") && mobileAuthCookie) {
    nextHeaders.set("cookie", mobileAuthCookie);
  }

  return nextHeaders;
}

export type { AppBindings };
