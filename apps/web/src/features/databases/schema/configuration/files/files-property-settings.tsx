import { FilesLimitValue } from "@zilobase/features/databases";
import { Hash } from "@/shared/components/icons";

import type { DatabasePropertyConfig } from "@zilobase/features/databases";
import { PropertySettingSubmenu } from "../shared/property-setting-submenu";

const filesLimitOptions = [
  { label: "1 file", value: "one_file" },
  { label: "No limit", value: "no_limit" },
] satisfies { label: string; value: FilesLimitValue }[];

export function FilesPropertySettings({
  config,
  onUpdateConfig,
}: {
  config: Required<Pick<DatabasePropertyConfig, "filesLimit">>;
  onUpdateConfig: (config: DatabasePropertyConfig) => void;
}) {
  return (
    <PropertySettingSubmenu
      icon={<Hash />}
      label="Limit"
      onSelect={(filesLimit) => onUpdateConfig({ filesLimit })}
      options={filesLimitOptions}
      selectedValue={config.filesLimit}
    />
  );
}

export { getFilesPropertyConfig } from "@zilobase/features/databases";
