import { type SettingsSection } from "@/components/settings/settings-sidebar";
import { editionWebModule } from "@zilobase/edition-web";
import {
  ApiKeysSettingsPage,
  ConnectedAppsSettingsPage,
  OAuthAppsSettingsPage,
  PreferencesSettingsPage,
  ProfileSettingsPage,
  SecuritySettingsPage,
  settingsUi,
} from "@/components/settings";
import { TeamspacesSettingsPage } from "@/components/teamspaces";
import { TeamSettingsPage } from "@/components/workspaces";
import CalendarSettingsPage from "@/components/settings/calendar";
import WorkspaceSettingsPage from "@/components/workspaces/workspace-settings";
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
      return <PreferencesSettingsPage />;
    case "workspace":
      return <WorkspaceSettingsPage />;
    case "security":
      return <SecuritySettingsPage />;
    case "api-keys":
      return <ApiKeysSettingsPage />;
    case "connected-apps":
      return <ConnectedAppsSettingsPage />;
    case "oauth-apps":
      return <OAuthAppsSettingsPage />;
    case "team":
      return <TeamSettingsPage />;
    case "teamspaces":
      return <TeamspacesSettingsPage />;
    case "calendar":
      return <CalendarSettingsPage />;
    case "profile":
    default:
      return <ProfileSettingsPage />;
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
