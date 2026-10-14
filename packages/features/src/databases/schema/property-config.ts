import type { DatabasePropertyConfig } from "../views/configuration";
import {
  getNumberDecimalPlaces,
  getNumberDisplayColor,
  getNumberDisplayDivideBy,
  getNumberDisplayShowNumber,
  getNumberDisplayStyle,
  getNumberFormat,
  type DatabaseNumberDisplayStyle,
  type NumberDecimalPlacesValue,
} from "../views/configuration";
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

export type NumberPropertyConfig = {
  numberDecimalPlaces: NumberDecimalPlacesValue;
  numberDisplayColor: string;
  numberDisplayDivideBy: number;
  numberDisplayShowNumber: boolean;
  numberDisplayStyle: DatabaseNumberDisplayStyle;
  numberFormat: string;
};

export function getNumberPropertyConfig(config: unknown): NumberPropertyConfig {
  return {
    numberDecimalPlaces: getNumberDecimalPlaces(config),
    numberDisplayColor: getNumberDisplayColor(config),
    numberDisplayDivideBy: getNumberDisplayDivideBy(config),
    numberDisplayShowNumber: getNumberDisplayShowNumber(config),
    numberDisplayStyle: getNumberDisplayStyle(config),
    numberFormat: getNumberFormat(config),
  };
}

export type FilesLimitValue = "one_file" | "no_limit";

export function getFilesPropertyConfig(config: unknown) {
  const parsedConfig =
    config && typeof config === "object" ? (config as DatabasePropertyConfig) : {};

  return {
    filesLimit: isFilesLimitValue(parsedConfig.filesLimit) ? parsedConfig.filesLimit : "no_limit",
  };
}

function isFilesLimitValue(value: unknown): value is FilesLimitValue {
  return value === "one_file" || value === "no_limit";
}

export function getRelationDeleteConfig(config: unknown) {
  const relation =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as { relation?: unknown }).relation
      : null;

  if (!relation || typeof relation !== "object" || Array.isArray(relation)) {
    return {};
  }

  const relationConfig = relation as {
    relatedDatabaseId?: unknown;
    relatedPropertyId?: unknown;
  };

  return {
    relatedDatabaseId:
      typeof relationConfig.relatedDatabaseId === "string"
        ? relationConfig.relatedDatabaseId
        : undefined,
    relatedPropertyId:
      typeof relationConfig.relatedPropertyId === "string"
        ? relationConfig.relatedPropertyId
        : undefined,
  };
}
