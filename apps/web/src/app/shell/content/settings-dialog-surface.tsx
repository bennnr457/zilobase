import { SettingsDialog } from "@/components/settings/settings-dialog";
import type { SettingsSection } from "@/components/settings/settings-sidebar";
import { SettingsSectionContent } from "./settings-section-content";

export function SettingsDialogSurface({
  activeSection,
  onOpenChange,
  onSectionChange,
}: {
  activeSection: SettingsSection;
  onOpenChange: (open: boolean) => void;
  onSectionChange: (section: SettingsSection) => void;
}) {
  return (
    <SettingsDialog
      activeSection={activeSection}
      onOpenChange={onOpenChange}
      onSectionChange={onSectionChange}
      open
    >
      <SettingsSectionContent section={activeSection} />
    </SettingsDialog>
  );
}
