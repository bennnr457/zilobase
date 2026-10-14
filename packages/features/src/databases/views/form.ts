import { getNextDatabaseOptionColor } from "../schema/color-ids";
import type { DatabaseProperty } from "../core/export-payload";
import { defaultStatusOptions } from "../schema/property-defaults";
import { getPersonLimit } from "./configuration";
import { getRelationLimit } from "../schema/relations";
export type DatabaseFormHeaderSettings = {
  cover: string;
  description: string;
  icon: string;
  iconPosition: "inline" | "top";
  title: string;
};

export const defaultDatabaseFormHeaderSettings: DatabaseFormHeaderSettings = {
  cover: "",
  description: "",
  icon: "",
  iconPosition: "inline",
  title: "",
};

export function getDatabaseFormHeaderSettings(config: unknown): DatabaseFormHeaderSettings {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return defaultDatabaseFormHeaderSettings;
  }

  const formHeader = (config as { formHeader?: unknown }).formHeader;

  if (!formHeader || typeof formHeader !== "object" || Array.isArray(formHeader)) {
    return defaultDatabaseFormHeaderSettings;
  }

  const settings = formHeader as Record<string, unknown>;

  return {
    cover: typeof settings.cover === "string" ? settings.cover : "",
    description: typeof settings.description === "string" ? settings.description : "",
    icon: typeof settings.icon === "string" ? settings.icon : "",
    iconPosition: settings.iconPosition === "top" ? "top" : "inline",
    title: typeof settings.title === "string" ? settings.title : "",
  };
}

export type DatabaseFormFillAccess = "workspace" | "public" | "closed";

export type DatabaseFormSubmissionAccess = "none" | "view" | "comment" | "edit" | "full";

export type DatabaseFormShareSettings = {
  anonymousResponses: boolean;
  fillAccess: DatabaseFormFillAccess;
  submissionAccess: DatabaseFormSubmissionAccess;
};

const defaultDatabaseFormShareSettings: DatabaseFormShareSettings = {
  anonymousResponses: true,
  fillAccess: "workspace",
  submissionAccess: "none",
};

export function getDatabaseFormShareSettings(config: unknown): DatabaseFormShareSettings {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return defaultDatabaseFormShareSettings;
  }

  const formShare = (config as { formShare?: unknown }).formShare;

  if (!formShare || typeof formShare !== "object" || Array.isArray(formShare)) {
    return defaultDatabaseFormShareSettings;
  }

  const settings = formShare as Record<string, unknown>;

  return {
    anonymousResponses: settings.anonymousResponses !== false,
    fillAccess: isDatabaseFormFillAccess(settings.fillAccess)
      ? settings.fillAccess
      : defaultDatabaseFormShareSettings.fillAccess,
    submissionAccess: isDatabaseFormSubmissionAccess(settings.submissionAccess)
      ? settings.submissionAccess
      : defaultDatabaseFormShareSettings.submissionAccess,
  };
}

function isDatabaseFormFillAccess(value: unknown): value is DatabaseFormFillAccess {
  return value === "workspace" || value === "public" || value === "closed";
}

function isDatabaseFormSubmissionAccess(value: unknown): value is DatabaseFormSubmissionAccess {
  return ["none", "view", "comment", "edit", "full"].includes(value as string);
}

export type DatabaseFormQuestionSettings = {
  description: string;
  descriptionEnabled: boolean;
  label: string;
  longAnswer: boolean;
  required: boolean;
  syncWithPropertyName: boolean;
};

export type DatabaseFormQuestionSettingsPatch = Partial<DatabaseFormQuestionSettings>;

export type DatabaseFormQuestionMove = "bottom" | "down" | "top" | "up";

export function getDatabaseFormQuestionSettings(
  config: unknown,
  propertyId: string,
  propertyName: string,
): DatabaseFormQuestionSettings {
  const settings = getDatabaseFormQuestionSettingsById(config)[propertyId];

  return {
    description: typeof settings?.description === "string" ? settings.description : "",
    descriptionEnabled: settings?.descriptionEnabled === true,
    label:
      settings?.syncWithPropertyName === false &&
      typeof settings.label === "string" &&
      settings.label.trim()
        ? settings.label
        : propertyName,
    longAnswer: settings?.longAnswer === true,
    required: settings?.required === true,
    syncWithPropertyName: settings?.syncWithPropertyName !== false,
  };
}

export function getDatabaseFormQuestionSettingsById(
  config: unknown,
): Record<string, DatabaseFormQuestionSettingsPatch> {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};

  const formQuestions = (config as { formQuestions?: unknown }).formQuestions;

  if (!formQuestions || typeof formQuestions !== "object" || Array.isArray(formQuestions)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(formQuestions).filter(
      ([, settings]) => settings && typeof settings === "object" && !Array.isArray(settings),
    ),
  ) as Record<string, DatabaseFormQuestionSettingsPatch>;
}

export function moveDatabaseFormQuestion(
  questionIds: string[],
  questionId: string,
  destination: DatabaseFormQuestionMove,
) {
  const currentIndex = questionIds.indexOf(questionId);

  if (currentIndex < 0 || questionIds.length < 2) return questionIds;

  const nextIndex =
    destination === "top"
      ? 0
      : destination === "bottom"
        ? questionIds.length - 1
        : destination === "up"
          ? Math.max(0, currentIndex - 1)
          : Math.min(questionIds.length - 1, currentIndex + 1);

  if (nextIndex === currentIndex) return questionIds;

  const nextQuestionIds = [...questionIds];
  nextQuestionIds.splice(currentIndex, 1);
  nextQuestionIds.splice(nextIndex, 0, questionId);
  return nextQuestionIds;
}

export type FormOption = {
  color?: string;
  id: string;
  name: string;
  suffix?: string;
};

function isFormOption(value: unknown): value is FormOption {
  return Boolean(
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string",
  );
}

export function getFormOptions(
  type: string,
  config: unknown,
  personOptions: Array<{ id: string; name: string; suffix?: string }>,
): FormOption[] {
  if (type === "person") return personOptions;

  const configuredOptions =
    config && typeof config === "object" && "options" in config
      ? (config as { options?: unknown }).options
      : undefined;
  const options = Array.isArray(configuredOptions) ? configuredOptions.filter(isFormOption) : [];

  return type === "status" && options.length === 0 ? defaultStatusOptions : options;
}

export function isOptionProperty(property: DatabaseProperty) {
  return ["select", "status", "multi_select"].includes(property.property.type);
}

export function getFormQuestionDescription(property: DatabaseProperty) {
  const type = property.property.type;
  const config = property.property.config;

  if (
    type === "multi_select" ||
    (type === "person" && getPersonLimit(config) !== "one_person") ||
    (type === "relation" && getRelationLimit(config) !== "one_page") ||
    (type === "files" && getFilesLimit(config) !== "one_file")
  )
    return "Respondents can select as many as they like";

  if (
    (type === "person" && getPersonLimit(config) === "one_person") ||
    (type === "relation" && getRelationLimit(config) === "one_page") ||
    (type === "files" && getFilesLimit(config) === "one_file")
  )
    return "Respondents can select up to 1";

  return undefined;
}

function getFilesLimit(config: unknown) {
  return config &&
    typeof config === "object" &&
    !Array.isArray(config) &&
    "filesLimit" in config &&
    config.filesLimit === "one_file"
    ? "one_file"
    : "no_limit";
}

export function getFormConfigWithAddedOption(type: string, config: unknown, optionName: string) {
  const options = getFormOptions(type, config, []);
  if (options.some((option) => option.name === optionName)) return null;
  const optionId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `option-${Date.now()}`;
  return {
    options: [
      ...options,
      { color: getNextDatabaseOptionColor(options.length), id: optionId, name: optionName },
    ],
  };
}
