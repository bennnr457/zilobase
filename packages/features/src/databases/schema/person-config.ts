import type { DatabasePropertyConfig } from "../views/configuration";
export type PersonDefaultValue = "no_default" | "created_by";

export type PersonLimitValue = "one_person" | "no_limit";

export type PersonNotificationsValue = "users_and_groups" | "users_only" | "none";

export function getPersonPropertyConfig(config: unknown) {
  const parsedConfig =
    config && typeof config === "object" ? (config as DatabasePropertyConfig) : {};

  return {
    personDefault: isPersonDefaultValue(parsedConfig.personDefault)
      ? parsedConfig.personDefault
      : "no_default",
    personLimit: isPersonLimitValue(parsedConfig.personLimit)
      ? parsedConfig.personLimit
      : "no_limit",
    personNotifications: isPersonNotificationsValue(parsedConfig.personNotifications)
      ? parsedConfig.personNotifications
      : "users_only",
  };
}

function isPersonLimitValue(value: unknown): value is PersonLimitValue {
  return value === "one_person" || value === "no_limit";
}

function isPersonDefaultValue(value: unknown): value is PersonDefaultValue {
  return value === "no_default" || value === "created_by";
}

function isPersonNotificationsValue(value: unknown): value is PersonNotificationsValue {
  return value === "users_and_groups" || value === "users_only" || value === "none";
}
