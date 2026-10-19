import { getInstanceAdministrationSettings } from "../settings/administration";
import { validateSelfHostedInvitationCandidate } from "./registration";
export async function prepareSocialRegistration(
  env: Record<string, unknown>,
  request: Request,
  communityRegistration: boolean,
) {
  const url = new URL(request.url);

  if (
    !communityRegistration ||
    request.method !== "POST" ||
    url.pathname !== "/api/auth/sign-in/social"
  ) {
    return { allowed: true as const, invitationId: null };
  }

  const body = await request
    .clone()
    .json()
    .catch(() => null);
  const invitationId =
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    typeof (body as Record<string, unknown>).invitationId === "string"
      ? (body as Record<string, string>).invitationId
      : null;

  if (!invitationId) {
    return { allowed: true as const, invitationId: null };
  }

  return validateSelfHostedInvitationCandidate(env, invitationId);
}

export async function isBlockedSelfHostedWorkspaceCreate(
  env: Record<string, unknown>,
  request: Request,
  communityRegistration: boolean,
) {
  const url = new URL(request.url);

  return (
    communityRegistration &&
    request.method === "POST" &&
    url.pathname === "/api/auth/organization/create" &&
    Boolean((await getInstanceAdministrationSettings(env)).pinnedWorkspaceId)
  );
}
