import type { Teamspace } from "./contracts";
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
