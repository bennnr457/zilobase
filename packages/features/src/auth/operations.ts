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

export type RequestSignInOtpOperationInput = string;
export type RequestSignInOtpOperationResult = Awaited<
  ReturnType<ZilobaseAuthClient["requestSignInOtp"]>
>;
export function requestSignInOtp(
  context: AuthenticatedClientOperationContext,
  input: RequestSignInOtpOperationInput,
): Promise<RequestSignInOtpOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { auth } = context;

    return clientMutation({
      mutationFn: (email: RequestSignInOtpOperationInput) => auth.requestSignInOtp(email),
    });
  });
}

export type SignInWithOtpOperationInput = SignInWithOtpInput;
export type SignInWithOtpOperationResult = Awaited<ReturnType<ZilobaseAuthClient["signInWithOtp"]>>;
export function signInWithOtp(
  context: AuthenticatedClientOperationContext,
  input: SignInWithOtpOperationInput,
): Promise<SignInWithOtpOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { auth, queryClient } = context;

    return clientMutation({
      mutationFn: (input: SignInWithOtpOperationInput) => auth.signInWithOtp(input),
      onSuccess: async () => {
        await refreshSessionQuery(auth, queryClient);
      },
    });
  });
}

export type SignInWithPasswordOperationInput = SignInWithPasswordInput;
export type SignInWithPasswordOperationResult = Awaited<
  ReturnType<ZilobaseAuthClient["signInWithPassword"]>
>;
export function signInWithPassword(
  context: AuthenticatedClientOperationContext,
  input: SignInWithPasswordOperationInput,
): Promise<SignInWithPasswordOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { auth, queryClient } = context;

    return clientMutation({
      mutationFn: (input: SignInWithPasswordOperationInput) => auth.signInWithPassword(input),
      onSuccess: async () => {
        await refreshSessionQuery(auth, queryClient);
      },
    });
  });
}

export type SignUpOperationInput = SignUpInput;
export type SignUpOperationResult = Awaited<ReturnType<ZilobaseAuthClient["signUp"]>>;
export function signUp(
  context: AuthenticatedClientOperationContext,
  input: SignUpOperationInput,
): Promise<SignUpOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { auth } = context;

    return clientMutation({
      mutationFn: (input: SignUpOperationInput) => auth.signUp(input),
    });
  });
}

export type RequestEmailVerificationOtpOperationInput = string;
export type RequestEmailVerificationOtpOperationResult = Awaited<
  ReturnType<ZilobaseAuthClient["requestEmailVerificationOtp"]>
>;
export function requestEmailVerificationOtp(
  context: AuthenticatedClientOperationContext,
  input: RequestEmailVerificationOtpOperationInput,
): Promise<RequestEmailVerificationOtpOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { auth } = context;

    return clientMutation({
      mutationFn: (email: RequestEmailVerificationOtpOperationInput) =>
        auth.requestEmailVerificationOtp(email),
    });
  });
}

export type VerifyEmailOtpOperationInput = VerifyEmailOtpInput;
export type VerifyEmailOtpOperationResult = Awaited<
  ReturnType<ZilobaseAuthClient["verifyEmailOtp"]>
>;
export function verifyEmailOtp(
  context: AuthenticatedClientOperationContext,
  input: VerifyEmailOtpOperationInput,
): Promise<VerifyEmailOtpOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { auth, queryClient } = context;

    return clientMutation({
      mutationFn: (input: VerifyEmailOtpOperationInput) => auth.verifyEmailOtp(input),
      onSuccess: async () => {
        await refreshSessionQuery(auth, queryClient);
      },
    });
  });
}

export type SignOutOperationInput = void;
export type SignOutOperationResult = Awaited<ReturnType<ZilobaseAuthClient["signOut"]>>;
export function signOut(
  context: AuthenticatedClientOperationContext,
  input: SignOutOperationInput,
): Promise<SignOutOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { auth, queryClient } = context;

    return clientMutation({
      mutationFn: () => auth.signOut(),
      onSuccess: () => {
        queryClient.setQueryData(sessionQueryKey, { user: null, session: null });
      },
    });
  });
}

export type UpdateUserProfileOperationInput = { email: string; name: string };
export type UpdateUserProfileOperationResult = { user: SessionUser };
export function updateUserProfile(
  context: ClientOperationContext,
  input: UpdateUserProfileOperationInput,
): Promise<UpdateUserProfileOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;

    return clientMutation({
      mutationFn: (input: UpdateUserProfileOperationInput) =>
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
  });
}

export type ChangePasswordOperationInput = {
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions?: boolean;
};
export type ChangePasswordOperationResult = {
  token: string | null;
  user: SessionUser;
};
export function changePassword(
  context: AuthenticatedClientOperationContext,
  input: ChangePasswordOperationInput,
): Promise<ChangePasswordOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, auth, queryClient } = context;

    return clientMutation({
      mutationFn: (input: ChangePasswordOperationInput) =>
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
  });
}

export type SetPasswordOperationInput = { newPassword: string };
export type SetPasswordOperationResult = { status: boolean };
export function setPassword(
  context: AuthenticatedClientOperationContext,
  input: SetPasswordOperationInput,
): Promise<SetPasswordOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, auth, queryClient } = context;

    return clientMutation({
      mutationFn: (input: SetPasswordOperationInput) =>
        apiFetch<{ status: boolean }>("/api/auth/set-password", {
          method: "POST",
          body: JSON.stringify(input),
        }),
      onSuccess: async () => {
        await refreshSessionQuery(auth, queryClient);
      },
    });
  });
}

export type DeleteAccountOperationInput = { password?: string };
export type DeleteAccountOperationResult = { message: string; success: boolean };
export function deleteAccount(
  context: ClientOperationContext,
  input: DeleteAccountOperationInput,
): Promise<DeleteAccountOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;

    return clientMutation({
      mutationFn: (input: DeleteAccountOperationInput) =>
        apiFetch<{ message: string; success: boolean }>("/api/auth/delete-user", {
          method: "POST",
          body: JSON.stringify(input),
        }),
      onSuccess: () => {
        queryClient.setQueryData(sessionQueryKey, { user: null, session: null });
      },
    });
  });
}
