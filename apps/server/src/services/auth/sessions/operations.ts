import { isCommunityRegistration } from "../../../shared/config/app-policy";
import {
  requireOperationPolicy,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import { getUserHasPassword } from "./password";
import { ensurePinnedWorkspaceMembership } from "./pinned-membership";
export async function getSessionOperation(
  context: ServerOperationContext,
  _input: Record<string, never>,
  measure: <T>(name: string, run: () => Promise<T>) => Promise<T> = (_name, run) => run(),
) {
  requireOperationPolicy(context, { write: false });
  const user = context.authentication.user;
  const session = context.authentication.session;

  if (!user) {
    throw new ServerOperationError({ user: null, session: null }, 401);
  }

  const [selfHostedWorkspaceId, hasPassword] = await Promise.all([
    measure("route_session_pin", () =>
      ensurePinnedWorkspaceMembership(
        context.env,
        user.id,
        user.emailVerified,
        session?.id,
        context.editionExtension ?? undefined,
        isCommunityRegistration(context.policy),
      ),
    ),
    measure("route_session_has_password", () => getUserHasPassword(user.id)),
  ]);
  const responseSession =
    session && selfHostedWorkspaceId && session.activeWorkspaceId !== selfHostedWorkspaceId
      ? { ...session, activeWorkspaceId: selfHostedWorkspaceId }
      : session;

  return {
    demoMode: context.authentication.authMethod === "demo",
    session: responseSession,
    workspacePinned: context.policy.workspaceSelection === "pinned",
    user: {
      ...user,
      hasPassword,
    },
  };
}
