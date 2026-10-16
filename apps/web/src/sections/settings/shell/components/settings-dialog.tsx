import { type SettingsSection } from "@/sections/settings/shell/components/settings-sidebar";
import { editionWebModule } from "@zilobase/edition-web";
import { default as ApiKeysSettingsScreen } from "@/sections/settings/api-keys/api-keys-settings-screen";
import { default as ConnectedAppsSettingsScreen } from "@/sections/settings/connected-apps/connected-apps-settings-screen";
import { default as OAuthAppsSettingsScreen } from "@/sections/settings/oauth-apps/oauth-apps-settings-screen";
import { default as PreferencesSettingsScreen } from "@/sections/settings/preferences/preferences-settings-screen";
import { default as ProfileSettingsScreen } from "@/sections/settings/profile/profile-settings-screen";
import { default as SecuritySettingsScreen } from "@/sections/settings/security/security-settings-screen";
import { settingsUi } from "@/sections/settings/shell/components/settings-layout";
import { default as TeamspacesSettingsScreen } from "@/sections/teamspaces/teamspaces-settings-screen";
import { default as WorkspaceMembersSettingsScreen } from "@/sections/workspaces/members/workspace-members-settings-screen";
import CalendarSettingsScreen from "@/sections/settings/calendar/calendar-settings-screen";
import WorkspaceSettingsScreen from "@/sections/workspaces/settings/workspace-settings-screen";
import { SettingsSidebar } from "./settings-sidebar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

function SettingsSectionContent({ section }: { section: SettingsSection }) {
  const editionSection = editionWebModule.settingsSections.find(
    (candidate) => candidate.id === section,
  );
  if (editionSection) {
    const EditionSettings = editionSection.component;
    return <EditionSettings settingsUi={settingsUi} />;
  }

  switch (section) {
    case "preferences":
      return <PreferencesSettingsScreen />;
    case "workspace":
      return <WorkspaceSettingsScreen />;
    case "security":
      return <SecuritySettingsScreen />;
    case "api-keys":
      return <ApiKeysSettingsScreen />;
    case "connected-apps":
      return <ConnectedAppsSettingsScreen />;
    case "oauth-apps":
      return <OAuthAppsSettingsScreen />;
    case "team":
      return <WorkspaceMembersSettingsScreen />;
    case "teamspaces":
      return <TeamspacesSettingsScreen />;
    case "calendar":
      return <CalendarSettingsScreen />;
    case "profile":
    default:
      return <ProfileSettingsScreen />;
  }
}

export function SettingsDialog({
  activeSection,
  onOpenChange,
  onSectionChange,
  open,
}: {
  activeSection: SettingsSection;
  onOpenChange: (open: boolean) => void;
  onSectionChange: (section: SettingsSection) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="h-[min(820px,calc(100svh-2rem))] gap-0 overflow-hidden p-0 sm:max-h-[calc(100svh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:grid-cols-[16rem_minmax(0,1fr)]"
        hideMobileDragHandle
        overlayClassName="bg-effect-scrim backdrop-blur-[1px]"
        unstyledContent
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Manage your account and workspace settings.
        </DialogDescription>
        <SettingsSidebar activeSection={activeSection} onSectionChange={onSectionChange} />
        <div className="flex min-h-0 min-w-0 flex-1 overflow-y-auto bg-surface-canvas">
          <SettingsSectionContent section={activeSection} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
