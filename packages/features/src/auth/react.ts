import { useMutation, useQuery } from "@tanstack/react-query";
import {
  changePassword,
  deleteAccount,
  requestEmailVerificationOtp,
  requestSignInOtp,
  setPassword,
  signInWithOtp,
  signInWithPassword,
  signOut,
  signUp,
  updateUserProfile,
  verifyEmailOtp,
} from "./operations";

import { useZilobaseFeatures } from "../shared/context";
import type {
  SignInWithOtpInput,
  SignInWithPasswordInput,
  SignUpInput,
  VerifyEmailOtpInput,
} from "./contracts";
import { sessionQueryOptions } from "./queries";

export function useSession() {
  const { auth } = useZilobaseFeatures();

  return useQuery(sessionQueryOptions(auth));
}

export function useRequestSignInOtp() {
  const context = useZilobaseFeatures();
  return useMutation({ mutationFn: (variables: string) => requestSignInOtp(context, variables) });
}

export function useSignInWithOtp() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: SignInWithOtpInput) => signInWithOtp(context, variables),
  });
}

export function useSignInWithPassword() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: SignInWithPasswordInput) => signInWithPassword(context, variables),
  });
}

export function useSignUp() {
  const context = useZilobaseFeatures();
  return useMutation({ mutationFn: (variables: SignUpInput) => signUp(context, variables) });
}

export function useRequestEmailVerificationOtp() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: string) => requestEmailVerificationOtp(context, variables),
  });
}

export function useVerifyEmailOtp() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: VerifyEmailOtpInput) => verifyEmailOtp(context, variables),
  });
}

export function useSignOut() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: Parameters<typeof signOut>[1]) => signOut(context, variables),
  });
}

export function useUpdateUserProfile() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: { email: string; name: string }) =>
      updateUserProfile(context, variables),
  });
}

export function useChangePassword() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: {
      currentPassword: string;
      newPassword: string;
      revokeOtherSessions?: boolean;
    }) => changePassword(context, variables),
  });
}

export function useSetPassword() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: { newPassword: string }) => setPassword(context, variables),
  });
}

export function useDeleteAccount() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: { password?: string }) => deleteAccount(context, variables),
  });
}
