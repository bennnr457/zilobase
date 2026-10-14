import type { Teamspace, TeamspaceAccessMode } from "./contracts";

export function getTeamspaceCreationInput(draft: {
  accessMode: TeamspaceAccessMode;
  description: string;
  name: string;
  workspaceId: string | null | undefined;
}) {
  if (!draft.workspaceId || !draft.name.trim()) return null;
  return {
    accessMode: draft.accessMode,
    description: draft.description.trim() || null,
    name: draft.name.trim(),
    workspaceId: draft.workspaceId,
  };
}

export type TeamspaceFilter = {
  accessMode: "all" | TeamspaceAccessMode;
  membership: "all" | "joined" | "available" | "ownerless";
  query: string;
};

export function filterTeamspaces(teamspaces: Teamspace[], filter: TeamspaceFilter) {
  const query = filter.query.trim().toLocaleLowerCase();

  return teamspaces.filter((teamspace) => {
    if (filter.accessMode !== "all" && teamspace.accessMode !== filter.accessMode) {
      return false;
    }
    if (filter.membership === "joined" && !teamspace.currentUserRole) return false;
    if (filter.membership === "available" && teamspace.currentUserRole) return false;
    if (filter.membership === "ownerless" && teamspace.ownerIds?.length !== 0) {
      return false;
    }
    if (!query) return true;

    return `${teamspace.name} ${teamspace.description ?? ""}`.toLocaleLowerCase().includes(query);
  });
}

export function getTeamspaceManagementPermissions(
  teamspace: Pick<Teamspace, "currentUserRole" | "isDefault" | "ownerIds">,
  workspaceManager: boolean,
) {
  return {
    canManage: workspaceManager || teamspace.currentUserRole === "owner",
    canSetDefault: workspaceManager && !teamspace.isDefault,
    canRecoverOwner: workspaceManager && teamspace.ownerIds?.length === 0,
  };
}

export function getTeamspacePrincipalCandidates(
  principals: { principalId: string }[],
  targets:
    | {
        members: { id: string; name: string; email: string }[];
        teams: { id: string; name: string }[];
      }
    | undefined,
) {
  const memberIds = new Set(principals.map((principal) => principal.principalId));
  return [
    ...(targets?.members ?? [])
      .filter((member) => !memberIds.has(member.id))
      .map((member) => ({
        id: member.id,
        label: `${member.name} · ${member.email}`,
        type: "user" as const,
      })),
    ...(targets?.teams ?? [])
      .filter((team) => !memberIds.has(team.id))
      .map((team) => ({
        id: team.id,
        label: `${team.name} · group`,
        type: "team" as const,
      })),
  ];
}

type SidebarTeamspace = Pick<Teamspace, "currentUserRole" | "invitePolicy" | "isDefault">;

export function getTeamspaceSidebarPermissions(
  teamspace: SidebarTeamspace,
  workspaceCanManage: boolean,
) {
  const canManage = workspaceCanManage || teamspace.currentUserRole === "owner";
  const canInvite =
    teamspace.currentUserRole === "owner" ||
    (teamspace.currentUserRole === "member" && teamspace.invitePolicy === "owners_and_members");

  return {
    canArchive: canManage && !teamspace.isDefault,
    canInvite,
    canLeave: Boolean(teamspace.currentUserRole && !teamspace.isDefault),
    canManage,
  };
}

export function readTeamspaceInvitation(search: string, workspaceId: string) {
  const params = new URLSearchParams(search);
  const token = params.get("invite");
  return token && params.get("workspace") === workspaceId ? { token, workspaceId } : null;
}
