import type { WorkspaceRole, Workspace } from "./contracts";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function localDateTimeToIso(value: string) {
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function isoToLocalDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function getDefaultTemporaryExpiration(now = Date.now()) {
  return isoToLocalDateTime(new Date(now + 30 * DAY_IN_MS).toISOString());
}

export function getMinimumTemporaryExpiration(now = Date.now()) {
  return isoToLocalDateTime(new Date(now + 60_000).toISOString());
}

export function getMaximumTemporaryExpiration(now = Date.now()) {
  return isoToLocalDateTime(new Date(now + 365 * DAY_IN_MS).toISOString());
}

export function normalizeWorkspaceRole(value: string | null | undefined): WorkspaceRole | null {
  return value === "owner" || value === "admin" || value === "member" || value === "temporary"
    ? value
    : null;
}

export function canEditWorkspaceMember(input: {
  actorRole: WorkspaceRole | null;
  canManage: boolean;
  memberRole: WorkspaceRole;
  workspaceId: string | null | undefined;
}) {
  return Boolean(
    input.canManage &&
    input.workspaceId &&
    (input.memberRole !== "owner" || input.actorRole === "owner"),
  );
}

export function getRoleDraftExpiration(role: WorkspaceRole, current: string) {
  return role === "temporary" ? current || getDefaultTemporaryExpiration() : "";
}

export function getRoleAccessExpiration(role: WorkspaceRole, value: string) {
  return role === "temporary" ? localDateTimeToIso(value) : null;
}

export function isValidInvitationEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidWorkspaceSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function isValidWorkspaceLogoUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function readSingleInvitationId(search: string) {
  const values = new URLSearchParams(search).getAll("id");
  const value = values[0]?.trim();
  return values.length === 1 && value ? value : null;
}

export function resolveActiveWorkspaceId(input: {
  preferredActiveWorkspaceId: string | null | undefined;
  sessionWorkspaceId: string | null | undefined;
  status: "error" | "pending" | "success";
  workspaces: ReadonlyArray<Pick<Workspace, "id">>;
}) {
  const { preferredActiveWorkspaceId, sessionWorkspaceId, status, workspaces } = input;
  const storedWorkspace = workspaces.find(
    (workspace) => workspace.id === preferredActiveWorkspaceId,
  );
  const sessionWorkspace = workspaces.find((workspace) => workspace.id === sessionWorkspaceId);

  const validatedWorkspaceId = storedWorkspace?.id ?? sessionWorkspace?.id ?? workspaces[0]?.id;

  if (validatedWorkspaceId) return validatedWorkspaceId;

  // Do not start workspace-scoped queries or realtime connections with an ID
  // that has not yet been checked against the user's current workspace list.
  // If that list is unavailable, retain the previous fallback so the rest of
  // the application can continue operating in a degraded network state.
  return unavailableWorkspaceFallback(status, sessionWorkspaceId, preferredActiveWorkspaceId);
}

function unavailableWorkspaceFallback(
  status: "error" | "pending" | "success",
  sessionWorkspaceId: string | null | undefined,
  preferredActiveWorkspaceId: string | null | undefined,
) {
  return status === "error" ? (sessionWorkspaceId ?? preferredActiveWorkspaceId ?? null) : null;
}
