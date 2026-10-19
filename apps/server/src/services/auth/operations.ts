import { isCommunityRegistration } from "../../shared/config/app-policy";
import { getCanonicalApiOrigin } from "../../shared/config/config";
import { isBlockedSelfHostedWorkspaceCreate } from "../instance/registration/auth-policy";
import { expireTemporaryMemberships } from "../memberships/temporary-membership";
import {
  requireOperationActor,
  requireOperationPolicy,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { createAuth, type Auth } from "./auth";
import { getAuthHeaders } from "./sessions/headers";

/** Cookie/session verification and auth plugin policy remain owned by Better Auth. */
async function authOperation(
  context: ServerOperationContext,
  sessionRequired: boolean,
  write = true,
) {
  requireOperationPolicy(context, { write });
  if (sessionRequired) {
    requireOperationActor(context);
    if (context.authentication.authMethod !== "session")
      throw new ServerOperationError({ error: "Unauthorized" }, 401);
  }
  const request = context.request ?? new Request(getCanonicalApiOrigin(context.env));
  const auth = await createAuth(context.env, request, undefined, {
    policy: context.policy,
    editionExtension: context.editionExtension ?? undefined,
  });
  const headers = new Headers(request.headers);
  if (!context.request && context.authentication.session?.token)
    headers.set("authorization", `Bearer ${context.authentication.session.token}`);
  return { auth, headers: await getAuthHeaders(auth, headers) };
}

export type RequestSignInOtpServerInput = NonNullable<
  Parameters<Auth["api"]["sendVerificationOTP"]>[0]
>["body"];
export async function requestSignInOtpAuthOperation(
  context: ServerOperationContext,
  input: RequestSignInOtpServerInput,
) {
  const { auth, headers } = await authOperation(context, false);

  return auth.api.sendVerificationOTP({ body: { ...input, type: "sign-in" as const }, headers });
}

export type SignInWithOtpServerInput = NonNullable<
  Parameters<Auth["api"]["signInEmailOTP"]>[0]
>["body"];
export async function signInWithOtpAuthOperation(
  context: ServerOperationContext,
  input: SignInWithOtpServerInput,
) {
  const { auth, headers } = await authOperation(context, false);

  return auth.api.signInEmailOTP({ body: input, headers });
}

export type SignInWithPasswordServerInput = NonNullable<
  Parameters<Auth["api"]["signInEmail"]>[0]
>["body"];
export async function signInWithPasswordAuthOperation(
  context: ServerOperationContext,
  input: SignInWithPasswordServerInput,
) {
  const { auth, headers } = await authOperation(context, false);

  return auth.api.signInEmail({ body: input, headers });
}

export type SignUpServerInput = NonNullable<Parameters<Auth["api"]["signUpEmail"]>[0]>["body"];
export async function signUpAuthOperation(
  context: ServerOperationContext,
  input: SignUpServerInput,
) {
  const { auth, headers } = await authOperation(context, false);

  return auth.api.signUpEmail({ body: input, headers });
}

export type RequestEmailVerificationOtpServerInput = NonNullable<
  Parameters<Auth["api"]["sendVerificationOTP"]>[0]
>["body"];
export async function requestEmailVerificationOtpAuthOperation(
  context: ServerOperationContext,
  input: RequestEmailVerificationOtpServerInput,
) {
  const { auth, headers } = await authOperation(context, false);

  return auth.api.sendVerificationOTP({
    body: { ...input, type: "email-verification" as const },
    headers,
  });
}

export type VerifyEmailOtpServerInput = NonNullable<
  Parameters<Auth["api"]["verifyEmailOTP"]>[0]
>["body"];
export async function verifyEmailOtpAuthOperation(
  context: ServerOperationContext,
  input: VerifyEmailOtpServerInput,
) {
  const { auth, headers } = await authOperation(context, false);

  return auth.api.verifyEmailOTP({ body: input, headers });
}

export type SignOutServerInput = Record<string, never>;
export async function signOutAuthOperation(
  context: ServerOperationContext,
  input: SignOutServerInput,
) {
  const { auth, headers } = await authOperation(context, true);

  return auth.api.signOut({ headers });
}

export type ChangePasswordServerInput = NonNullable<
  Parameters<Auth["api"]["changePassword"]>[0]
>["body"];
export async function changePasswordAuthOperation(
  context: ServerOperationContext,
  input: ChangePasswordServerInput,
) {
  const { auth, headers } = await authOperation(context, true);

  return auth.api.changePassword({ body: input, headers });
}

export type SetPasswordServerInput = NonNullable<Parameters<Auth["api"]["setPassword"]>[0]>["body"];
export async function setPasswordAuthOperation(
  context: ServerOperationContext,
  input: SetPasswordServerInput,
) {
  const { auth, headers } = await authOperation(context, true);

  return auth.api.setPassword({ body: input, headers });
}

export type DeleteAccountServerInput = NonNullable<
  Parameters<Auth["api"]["deleteUser"]>[0]
>["body"];
export async function deleteAccountAuthOperation(
  context: ServerOperationContext,
  input: DeleteAccountServerInput,
) {
  const { auth, headers } = await authOperation(context, true);

  return auth.api.deleteUser({ body: input, headers });
}

export type CreateWorkspaceServerInput = Omit<
  NonNullable<Parameters<Auth["api"]["createOrganization"]>[0]>["body"],
  "userId"
>;
export async function createWorkspaceAuthOperation(
  context: ServerOperationContext,
  input: CreateWorkspaceServerInput,
) {
  requireOperationPolicy(context, { write: true });
  const request = new Request(
    new URL(
      "/api/auth/organization/create",
      context.request?.url ?? getCanonicalApiOrigin(context.env),
    ),
    { method: "POST" },
  );
  if (
    await isBlockedSelfHostedWorkspaceCreate(
      context.env,
      request,
      isCommunityRegistration(context.policy),
    )
  )
    throw new ServerOperationError(
      { error: "Self-hosted deployments can only have one workspace." },
      409,
    );
  const { auth, headers } = await authOperation(context, true);
  await expireTemporaryMemberships();
  return auth.api.createOrganization({
    body: { ...input, userId: requireOperationActor(context).id },
    headers,
  });
}

export type SetActiveWorkspaceServerInput = NonNullable<
  Parameters<Auth["api"]["setActiveOrganization"]>[0]
>["body"];
export async function setActiveWorkspaceAuthOperation(
  context: ServerOperationContext,
  input: SetActiveWorkspaceServerInput,
) {
  const { auth, headers } = await authOperation(context, true);
  await expireTemporaryMemberships();
  return auth.api.setActiveOrganization({ body: input, headers });
}

export type AcceptWorkspaceInvitationServerInput = NonNullable<
  Parameters<Auth["api"]["acceptInvitation"]>[0]
>["body"];
export async function acceptWorkspaceInvitationAuthOperation(
  context: ServerOperationContext,
  input: AcceptWorkspaceInvitationServerInput,
) {
  const { auth, headers } = await authOperation(context, true);
  await expireTemporaryMemberships();
  return auth.api.acceptInvitation({ body: input, headers });
}

export type ListWorkspacesServerInput = Record<string, never>;
export async function listWorkspacesAuthOperation(
  context: ServerOperationContext,
  input: ListWorkspacesServerInput,
) {
  const { auth, headers } = await authOperation(context, true, false);
  await expireTemporaryMemberships();
  return auth.api.listOrganizations({ headers });
}

export type ListWorkspaceInvitationsServerInput = NonNullable<
  Parameters<Auth["api"]["listInvitations"]>[0]
>["query"];
export async function listWorkspaceInvitationsAuthOperation(
  context: ServerOperationContext,
  input: ListWorkspaceInvitationsServerInput,
) {
  const { auth, headers } = await authOperation(context, true, false);
  await expireTemporaryMemberships();
  return auth.api.listInvitations({ query: input, headers });
}

export type ListOAuthAppsServerInput = Record<string, never>;
export async function listOAuthAppsAuthOperation(
  context: ServerOperationContext,
  input: ListOAuthAppsServerInput,
) {
  const { auth, headers } = await authOperation(context, true, false);

  return auth.api.getOAuthClients({ headers });
}

export type CreateOAuthAppServerInput = NonNullable<
  Parameters<Auth["api"]["createOAuthClient"]>[0]
>["body"];
export async function createOAuthAppAuthOperation(
  context: ServerOperationContext,
  input: CreateOAuthAppServerInput,
) {
  const { auth, headers } = await authOperation(context, true);

  return auth.api.createOAuthClient({ body: input, headers });
}

export type DeleteOAuthAppServerInput = NonNullable<
  Parameters<Auth["api"]["deleteOAuthClient"]>[0]
>["body"];
export async function deleteOAuthAppAuthOperation(
  context: ServerOperationContext,
  input: DeleteOAuthAppServerInput,
) {
  const { auth, headers } = await authOperation(context, true);

  return auth.api.deleteOAuthClient({ body: input, headers });
}

export type ListOAuthConsentsServerInput = Record<string, never>;
export async function listOAuthConsentsAuthOperation(
  context: ServerOperationContext,
  input: ListOAuthConsentsServerInput,
) {
  const { auth, headers } = await authOperation(context, true, false);

  return auth.api.getOAuthConsents({ headers });
}

export type RevokeOAuthConsentServerInput = NonNullable<
  Parameters<Auth["api"]["deleteOAuthConsent"]>[0]
>["body"];
export async function revokeOAuthConsentAuthOperation(
  context: ServerOperationContext,
  input: RevokeOAuthConsentServerInput,
) {
  const { auth, headers } = await authOperation(context, true);

  return auth.api.deleteOAuthConsent({ body: input, headers });
}

export type SubmitOAuthConsentServerInput = NonNullable<
  Parameters<Auth["api"]["oauth2Consent"]>[0]
>["body"];
export async function submitOAuthConsentAuthOperation(
  context: ServerOperationContext,
  input: SubmitOAuthConsentServerInput,
) {
  const { auth, headers } = await authOperation(context, true);

  return auth.api.oauth2Consent({ body: input, headers });
}

export type GetPublicOAuthClientServerInput = NonNullable<
  Parameters<Auth["api"]["getOAuthClientPublic"]>[0]
>["query"];
export async function getPublicOAuthClientAuthOperation(
  context: ServerOperationContext,
  input: GetPublicOAuthClientServerInput,
) {
  const { auth, headers } = await authOperation(context, false, false);

  return auth.api.getOAuthClientPublic({ query: input, headers });
}
