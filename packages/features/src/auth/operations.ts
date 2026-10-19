import type { Query, QueryClient } from "@tanstack/react-query";
import type { ZilobaseAuthClient } from "../shared/auth-client";
import {
  clientAuthPort,
  type AuthenticatedClientOperationContext,
  type ClientOperationContext,
} from "../shared/operation-context";
import { clientMutation, runClientMutation } from "../shared/operation-mutation";

import type {
  SessionResponse,
  SessionUser,
  SignInWithOtpInput,
  SignInWithPasswordInput,
  SignUpInput,
  VerifyEmailOtpInput,
} from "./contracts";
import { sessionQueryKey, sessionQueryOptions } from "./queries";

function sessionQuery(queryClient: QueryClient) {
  // QueryCache.find preserves the data type but does not infer the key tuple.
  return queryClient.getQueryCache().find<SessionResponse>({ queryKey: sessionQueryKey }) as
    | Query<SessionResponse, Error, SessionResponse, typeof sessionQueryKey>
    | undefined;
}

async function refreshSessionQuery(auth: ZilobaseAuthClient, queryClient: QueryClient) {
  const previousQueryFn = sessionQuery(queryClient)?.options.queryFn;
  await queryClient.cancelQueries({ queryKey: sessionQueryKey });
  const options = { ...sessionQueryOptions(auth), staleTime: 0 };
  try {
    return await queryClient.fetchQuery(options);
  } finally {
    // A successful login changes identity. Future observer refreshes must use
    // the reusable auth port rather than this operation's now-expired guard.
    const query = sessionQuery(queryClient);
    if (query && query.options.queryFn === options.queryFn) {
      query.setOptions({
        ...query.options,
        queryFn: previousQueryFn ?? sessionQueryOptions(clientAuthPort(auth)).queryFn,
      });
    }
  }
}

function defineRequestSignInOtpMutation(context: AuthenticatedClientOperationContext) {
  const { auth } = context;

  return clientMutation({
    mutationFn: (email: string) => auth.requestSignInOtp(email),
  });
}
export type RequestSignInOtpOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineRequestSignInOtpMutation>["mutationFn"]>
>[0];
export type RequestSignInOtpOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineRequestSignInOtpMutation>["mutationFn"]>>
>;
export function requestSignInOtp(
  context: AuthenticatedClientOperationContext,
  input: RequestSignInOtpOperationInput,
): Promise<RequestSignInOtpOperationResult> {
  return runClientMutation(context, input, (context) => defineRequestSignInOtpMutation(context));
}

function defineSignInWithOtpMutation(context: AuthenticatedClientOperationContext) {
  const { auth, queryClient } = context;

  return clientMutation({
    mutationFn: (input: SignInWithOtpInput) => auth.signInWithOtp(input),
    onSuccess: async () => {
      await refreshSessionQuery(auth, queryClient);
    },
  });
}
export type SignInWithOtpOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineSignInWithOtpMutation>["mutationFn"]>
>[0];
export type SignInWithOtpOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineSignInWithOtpMutation>["mutationFn"]>>
>;
export function signInWithOtp(
  context: AuthenticatedClientOperationContext,
  input: SignInWithOtpOperationInput,
): Promise<SignInWithOtpOperationResult> {
  return runClientMutation(context, input, (context) => defineSignInWithOtpMutation(context));
}

function defineSignInWithPasswordMutation(context: AuthenticatedClientOperationContext) {
  const { auth, queryClient } = context;

  return clientMutation({
    mutationFn: (input: SignInWithPasswordInput) => auth.signInWithPassword(input),
    onSuccess: async () => {
      await refreshSessionQuery(auth, queryClient);
    },
  });
}
export type SignInWithPasswordOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineSignInWithPasswordMutation>["mutationFn"]>
>[0];
export type SignInWithPasswordOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineSignInWithPasswordMutation>["mutationFn"]>>
>;
export function signInWithPassword(
  context: AuthenticatedClientOperationContext,
  input: SignInWithPasswordOperationInput,
): Promise<SignInWithPasswordOperationResult> {
  return runClientMutation(context, input, (context) => defineSignInWithPasswordMutation(context));
}

function defineSignUpMutation(context: AuthenticatedClientOperationContext) {
  const { auth } = context;

  return clientMutation({
    mutationFn: (input: SignUpInput) => auth.signUp(input),
  });
}
export type SignUpOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineSignUpMutation>["mutationFn"]>
>[0];
export type SignUpOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineSignUpMutation>["mutationFn"]>>
>;
export function signUp(
  context: AuthenticatedClientOperationContext,
  input: SignUpOperationInput,
): Promise<SignUpOperationResult> {
  return runClientMutation(context, input, (context) => defineSignUpMutation(context));
}

function defineRequestEmailVerificationOtpMutation(context: AuthenticatedClientOperationContext) {
  const { auth } = context;

  return clientMutation({
    mutationFn: (email: string) => auth.requestEmailVerificationOtp(email),
  });
}
export type RequestEmailVerificationOtpOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineRequestEmailVerificationOtpMutation>["mutationFn"]>
>[0];
export type RequestEmailVerificationOtpOperationResult = Awaited<
  ReturnType<
    NonNullable<ReturnType<typeof defineRequestEmailVerificationOtpMutation>["mutationFn"]>
  >
>;
export function requestEmailVerificationOtp(
  context: AuthenticatedClientOperationContext,
  input: RequestEmailVerificationOtpOperationInput,
): Promise<RequestEmailVerificationOtpOperationResult> {
  return runClientMutation(context, input, (context) =>
    defineRequestEmailVerificationOtpMutation(context),
  );
}

function defineVerifyEmailOtpMutation(context: AuthenticatedClientOperationContext) {
  const { auth, queryClient } = context;

  return clientMutation({
    mutationFn: (input: VerifyEmailOtpInput) => auth.verifyEmailOtp(input),
    onSuccess: async () => {
      await refreshSessionQuery(auth, queryClient);
    },
  });
}
export type VerifyEmailOtpOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineVerifyEmailOtpMutation>["mutationFn"]>
>[0];
export type VerifyEmailOtpOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineVerifyEmailOtpMutation>["mutationFn"]>>
>;
export function verifyEmailOtp(
  context: AuthenticatedClientOperationContext,
  input: VerifyEmailOtpOperationInput,
): Promise<VerifyEmailOtpOperationResult> {
  return runClientMutation(context, input, (context) => defineVerifyEmailOtpMutation(context));
}

function defineSignOutMutation(context: AuthenticatedClientOperationContext) {
  const { auth, queryClient } = context;

  return clientMutation({
    mutationFn: () => auth.signOut(),
    onSuccess: () => {
      queryClient.setQueryData(sessionQueryKey, { user: null, session: null });
    },
  });
}
export type SignOutOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineSignOutMutation>["mutationFn"]>
>[0];
export type SignOutOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineSignOutMutation>["mutationFn"]>>
>;
export function signOut(
  context: AuthenticatedClientOperationContext,
  input: SignOutOperationInput,
): Promise<SignOutOperationResult> {
  return runClientMutation(context, input, (context) => defineSignOutMutation(context));
}

function defineUpdateUserProfileMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: (input: { email: string; name: string }) =>
      apiFetch<{ user: SessionUser }>("/user-settings/profile", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(sessionQueryKey, (current: SessionResponse | undefined) => ({
        session: current?.session ?? null,
        user,
      }));
    },
  });
}
export type UpdateUserProfileOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineUpdateUserProfileMutation>["mutationFn"]>
>[0];
export type UpdateUserProfileOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdateUserProfileMutation>["mutationFn"]>>
>;
export function updateUserProfile(
  context: ClientOperationContext,
  input: UpdateUserProfileOperationInput,
): Promise<UpdateUserProfileOperationResult> {
  return runClientMutation(context, input, (context) => defineUpdateUserProfileMutation(context));
}

function defineChangePasswordMutation(context: AuthenticatedClientOperationContext) {
  const { apiFetch, auth, queryClient } = context;

  return clientMutation({
    mutationFn: (input: {
      currentPassword: string;
      newPassword: string;
      revokeOtherSessions?: boolean;
    }) =>
      apiFetch<{
        token: string | null;
        user: SessionUser;
      }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await refreshSessionQuery(auth, queryClient);
    },
  });
}
export type ChangePasswordOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineChangePasswordMutation>["mutationFn"]>
>[0];
export type ChangePasswordOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineChangePasswordMutation>["mutationFn"]>>
>;
export function changePassword(
  context: AuthenticatedClientOperationContext,
  input: ChangePasswordOperationInput,
): Promise<ChangePasswordOperationResult> {
  return runClientMutation(context, input, (context) => defineChangePasswordMutation(context));
}

function defineSetPasswordMutation(context: AuthenticatedClientOperationContext) {
  const { apiFetch, auth, queryClient } = context;

  return clientMutation({
    mutationFn: (input: { newPassword: string }) =>
      apiFetch<{ status: boolean }>("/api/auth/set-password", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await refreshSessionQuery(auth, queryClient);
    },
  });
}
export type SetPasswordOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineSetPasswordMutation>["mutationFn"]>
>[0];
export type SetPasswordOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineSetPasswordMutation>["mutationFn"]>>
>;
export function setPassword(
  context: AuthenticatedClientOperationContext,
  input: SetPasswordOperationInput,
): Promise<SetPasswordOperationResult> {
  return runClientMutation(context, input, (context) => defineSetPasswordMutation(context));
}

function defineDeleteAccountMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: (input: { password?: string }) =>
      apiFetch<{ message: string; success: boolean }>("/api/auth/delete-user", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.setQueryData(sessionQueryKey, { user: null, session: null });
    },
  });
}
export type DeleteAccountOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineDeleteAccountMutation>["mutationFn"]>
>[0];
export type DeleteAccountOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineDeleteAccountMutation>["mutationFn"]>>
>;
export function deleteAccount(
  context: ClientOperationContext,
  input: DeleteAccountOperationInput,
): Promise<DeleteAccountOperationResult> {
  return runClientMutation(context, input, (context) => defineDeleteAccountMutation(context));
}
