import { Hono } from "hono";
import { ServiceMutationError } from "../shared/errors/service-mutation-error";
import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { notificationRoutes } from "../routes/notifications/routes";
import { searchRoutes } from "../routes/search/routes";
import { workspaceRoutes } from "../routes/workspaces/routes";
import { communityAppPolicy } from "../shared/config/app-policy";
import type { AppBindings } from "../shared/contracts/http";
import {
  createServerOperations,
  ServerOperationError,
  type ServerOperationContext,
} from "./operations";

const mocks = vi.hoisted(() => ({
  mark: vi.fn(async (input: unknown) => ({ marked: input })),
  list: vi.fn(async () => ({ notifications: [], unreadCount: 0 })),
  membership: vi.fn<(...args: unknown[]) => Promise<{ role: string } | null>>(async () => null),
  updateMember: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("../services/notifications/inbox/notification-operations", () => ({
  markInProductNotificationRead: mocks.mark,
  listInProductNotifications: mocks.list,
}));
vi.mock("../services/access/principal-access", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getMembership: mocks.membership,
}));

vi.mock("../services/workspaces/members/workspace-members", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updateWorkspaceMember: mocks.updateMember,
}));

function context(patch: Partial<ServerOperationContext> = {}): ServerOperationContext {
  return {
    authentication: {
      authMethod: "session",
      user: {
        id: "verified-actor",
        email: "a@example.test",
        name: "A",
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: null,
      apiKey: null,
      oauthScopes: null,
    },
    activeWorkspaceId: null,
    pinnedWorkspaceId: null,
    env: { DATABASE_URL: "postgres://test:test@127.0.0.1:1/unused" },
    policy: communityAppPolicy,
    editionExtension: null,
    runtimePorts: {},
    requestId: "test",
    ...patch,
  };
}
function app(routes: Hono<AppBindings>, ctx: ServerOperationContext) {
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    for (const [key, value] of Object.entries(ctx.authentication))
      c.set(key as keyof AppBindings["Variables"], value as never);
    c.set("appPolicy", ctx.policy);
    c.set("editionExtension", ctx.editionExtension);
    c.set("runtimePorts", ctx.runtimePorts);
    c.set("requestId", ctx.requestId);
    await next();
  });
  app.route("/", routes);
  return app;
}
beforeEach(() => vi.clearAllMocks());

test("direct and HTTP notifications use the verified actor, never a payload actor", async () => {
  const ctx = context();
  const input = { workspaceId: "workspace", notificationId: "all", userId: "untrusted" };
  const direct = await createServerOperations(ctx).notifications.markRead(input);
  const response = await app(notificationRoutes, ctx).request("/workspace/notifications/all/read", {
    method: "POST",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), direct);
  for (const [actual] of mocks.mark.mock.calls)
    assert.deepEqual(actual, {
      notificationId: "all",
      workspaceId: "workspace",
      userId: "verified-actor",
    });
});

test("OAuth scope denials have the same body, status and challenge in direct and HTTP search", async () => {
  const ctx = context();
  ctx.authentication = { ...ctx.authentication, authMethod: "oauth", oauthScopes: [] };
  let error: ServerOperationError | undefined;
  try {
    await createServerOperations(ctx).search.workspace({ workspaceId: "workspace" });
  } catch (cause) {
    assert.ok(cause instanceof ServerOperationError);
    error = cause;
  }
  assert.ok(error);
  const response = await app(searchRoutes, ctx).request("/?workspaceId=workspace");
  assert.equal(response.status, error.status);
  assert.deepEqual(await response.json(), error.body);
  assert.equal(response.headers.get("www-authenticate"), error.headers["WWW-Authenticate"]);
});

test("demo writes and pinned workspace changes are denied before domain effects", async () => {
  for (const mode of ["demo", "apiKey"] as const) {
    const ctx = context({ pinnedWorkspaceId: mode === "apiKey" ? "pinned" : null });
    ctx.authentication = { ...ctx.authentication, authMethod: mode };
    await assert.rejects(
      createServerOperations(ctx).notifications.markRead({
        workspaceId: "other",
        notificationId: "all",
      }),
      (error) => error instanceof ServerOperationError && error.status === 403,
    );
  }
  assert.equal(mocks.mark.mock.calls.length, 0);
});

test("workspace administration retains authorization-before-body-validation ordering", async () => {
  const ctx = context();
  const direct = createServerOperations(ctx).workspaces.update({
    workspaceId: "workspace",
    body: { name: 123 },
  });
  await assert.rejects(
    direct,
    (error) => error instanceof ServerOperationError && error.status === 403,
  );
  const response = await app(workspaceRoutes, ctx).request("/workspace", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: "{broken",
  });
  assert.equal(response.status, 403);
});

test("direct and HTTP membership writes retain edition policy and typed failures", async () => {
  const extension = {} as NonNullable<ServerOperationContext["editionExtension"]>;
  const ctx = context({ editionExtension: extension });
  mocks.membership.mockResolvedValue({ role: "owner" });
  const failure = new ServiceMutationError("Edition policy denied membership change", 403);
  mocks.updateMember.mockRejectedValue(failure);
  const body = { role: "member" as const };
  await assert.rejects(
    createServerOperations(ctx).workspaces.updateMember({
      workspaceId: "workspace",
      memberId: "member",
      body,
    }),
    (error) => error === failure,
  );
  const response = await app(workspaceRoutes, ctx).request("/workspace/members/member", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: failure.message });
  assert.equal(mocks.updateMember.mock.calls.length, 2);
  for (const call of mocks.updateMember.mock.calls) {
    assert.equal(call[2], ctx.authentication.user);
    assert.equal(call[6], extension);
  }
  mocks.membership.mockResolvedValue(null);
});
