export type TeamspaceSettingsTab = "general" | "members" | "permissions" | "security";

export function isTeamspaceSettingsTab(value: unknown): value is TeamspaceSettingsTab {
  return (
    value === "general" || value === "members" || value === "permissions" || value === "security"
  );
}
