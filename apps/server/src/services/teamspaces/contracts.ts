import { type TeamspaceAccessMode, type TeamspaceInvitePolicy } from "./policy";
export class TeamspaceManagementError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "TeamspaceManagementError";
  }
}

export type TeamspaceUpdateInput = {
  accessMode?: TeamspaceAccessMode;
  description?: string | null;
  icon?: unknown;
  invitePolicy?: TeamspaceInvitePolicy;
  memberAccessLevel?: "view" | "comment" | "edit" | "full";
  name?: string;
  exportEnabled?: boolean;
  guestsEnabled?: boolean;
  publicSharingEnabled?: boolean;
  sidebarEditPolicy?: TeamspaceInvitePolicy;
};
