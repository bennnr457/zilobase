import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { communityAppPolicy } from "../../shared/config/app-policy";
import { ServerOperationError, type ServerOperationContext } from "../operations/context";
import {
  createWorkspaceAuthOperation,
  requestSignInOtpAuthOperation,
  requestEmailVerificationOtpAuthOperation,
  signOutAuthOperation,
  listOAuthAppsAuthOperation,
} from "./operations";
const mocks = vi.hoisted(() => ({
  createAuth: vi.fn(),
  blocked: vi.fn(async () => false),
  expire: vi.fn(async () => {}),
  createWorkspace: vi.fn(async (input: unknown) => ({ input })),
  otp: vi.fn(async () => ({ success: true })),
  signOut: vi.fn(async () => ({ success: true })),
  listClients: vi.fn(async () => []),
}));
vi.mock("./auth", () => ({ createAuth: mocks.createAuth }));
vi.mock("../instance/registration/auth-policy", () => ({
  isBlockedSelfHostedWorkspaceCreate: mocks.blocked,
}));
vi.mock("../memberships/temporary-membership", () => ({
  expireTemporaryMemberships: mocks.expire,
}));
function context(): ServerOperationContext {
  return {
    authentication: {
      user: { id: "verified" } as NonNullable<ServerOperationContext["authentication"]["user"]>,
      session: { token: "verified-token" } as NonNullable<
        ServerOperationContext["authentication"]["session"]
      >,
      apiKey: null,
      oauthScopes: null,
      authMethod: "session",
    },
    activeWorkspaceId: null,
    pinnedWorkspaceId: null,
    env: { BETTER_AUTH_URL: "https://api.example", CLIENT_URL: "https://app.example" },
    policy: communityAppPolicy,
    editionExtension: null,
    runtimePorts: {},
    requestId: "test",
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.blocked.mockResolvedValue(false);
  mocks.createAuth.mockResolvedValue({
    $context: Promise.resolve({ authCookies: { sessionToken: { name: "session-token" } } }),
    api: {
      createOrganization: mocks.createWorkspace,
      sendVerificationOTP: mocks.otp,
      signOut: mocks.signOut,
      getOAuthClients: mocks.listClients,
    },
  });
});
test("workspace creation uses the verified actor and forwards edition policy to the existing auth factory", async () => {
  const ctx = context();
  ctx.editionExtension = {} as NonNullable<ServerOperationContext["editionExtension"]>;
  const input = { name: "Workspace", slug: "workspace", userId: "untrusted" };
  await createWorkspaceAuthOperation(ctx, input);
  const argument = mocks.createWorkspace.mock.calls[0]![0] as {
    body: { userId: string };
    headers: Headers;
  };
  assert.equal(argument.body.userId, "verified");
  assert.equal(argument.headers.get("cookie"), "session-token=verified-token");
  assert.equal(mocks.createAuth.mock.calls[0]![3].editionExtension, ctx.editionExtension);
  assert.equal(mocks.createAuth.mock.calls[0]![3].policy, ctx.policy);
});
test("self-hosted workspace restrictions run before auth plugin initialization", async () => {
  mocks.blocked.mockResolvedValue(true);
  await assert.rejects(
    createWorkspaceAuthOperation(context(), { name: "Workspace", slug: "workspace" }),
    (error) => error instanceof ServerOperationError && error.status === 409,
  );
  assert.equal(mocks.createAuth.mock.calls.length, 0);
  assert.equal(mocks.createWorkspace.mock.calls.length, 0);
});
test("OTP operations retain their endpoint-specific verification type", async () => {
  await requestSignInOtpAuthOperation(context(), {
    email: "a@example.test",
    type: "forget-password",
  });
  await requestEmailVerificationOtpAuthOperation(context(), {
    email: "a@example.test",
    type: "sign-in",
  });
  const calls = mocks.otp.mock.calls as unknown as Array<[{ body: { type: string } }]>;
  assert.equal(calls[0]![0].body.type, "sign-in");
  assert.equal(calls[1]![0].body.type, "email-verification");
});
test("demo and delegated-token restrictions are applied before auth actions", async () => {
  const demo = context();
  demo.authentication.authMethod = "demo";
  await assert.rejects(
    signOutAuthOperation(demo, {}),
    (error) => error instanceof ServerOperationError && error.status === 403,
  );
  const oauth = context();
  oauth.authentication.authMethod = "oauth";
  await assert.rejects(
    listOAuthAppsAuthOperation(oauth, {}),
    (error) => error instanceof ServerOperationError && error.status === 403,
  );
  assert.equal(mocks.createAuth.mock.calls.length, 0);
});
