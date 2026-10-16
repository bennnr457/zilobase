import {
  PersonDefaultValue,
  PersonLimitValue,
  PersonNotificationsValue,
} from "@zilobase/features/databases";
import { Bell, CircleUserRound, Hash, UserRound } from "@/components/icons";
import type { ReactNode } from "react";

import type { DatabasePropertyConfig } from "@zilobase/features/databases";
import { PropertySettingSubmenu } from "../shared/components/property-setting-submenu";

const personLimitOptions = [
  { label: "1 Person", value: "one_person" },
  { label: "No limit", value: "no_limit" },
] satisfies { label: string; value: PersonLimitValue }[];

const personDefaultOptions = [
  { label: "No default", value: "no_default" },
  { icon: <UserRound />, label: "Created by", value: "created_by" },
] satisfies { icon?: ReactNode; label: string; value: PersonDefaultValue }[];

const personNotificationsOptions = [
  { label: "Users and groups", value: "users_and_groups" },
  { label: "Users only", value: "users_only" },
  { label: "None", value: "none" },
] satisfies { label: string; value: PersonNotificationsValue }[];

export function PersonPropertySettings({
  config,
  onUpdateConfig,
}: {
  config: Required<
    Pick<DatabasePropertyConfig, "personDefault" | "personLimit" | "personNotifications">
  >;
  onUpdateConfig: (config: DatabasePropertyConfig) => void;
}) {
  return (
    <>
      <PropertySettingSubmenu
        icon={<Hash />}
        label="Limit"
        onSelect={(personLimit) => onUpdateConfig({ personLimit })}
        options={personLimitOptions}
        selectedValue={config.personLimit}
      />
      <PropertySettingSubmenu
        icon={<CircleUserRound />}
        label="Default"
        onSelect={(personDefault) => onUpdateConfig({ personDefault })}
        options={personDefaultOptions}
        selectedValue={config.personDefault}
      />
      <PropertySettingSubmenu
        icon={<Bell />}
        label="Notifications"
        onSelect={(personNotifications) => onUpdateConfig({ personNotifications })}
        options={personNotificationsOptions}
        selectedValue={config.personNotifications}
      />
    </>
  );
}

export { getPersonPropertyConfig } from "@zilobase/features/databases";
