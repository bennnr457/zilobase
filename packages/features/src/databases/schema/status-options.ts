import { reorderOptionsByIds } from "./option-order";
import type { DatabasePropertyConfig } from "../views/configuration";
import { defaultStatusOptions } from "./property-defaults";

import type { DatabaseSelectOption } from "../views/configuration";

export type StatusOption = DatabaseSelectOption & {
  group?: string;
};

export const statusOptionGroupNames = [
  "Backlog",
  "To-do",
  "In progress",
  "Review",
  "Complete",
] as const;

export function getStatusOptionGroups(options: StatusOption[]) {
  return statusOptionGroupNames.map((name) => ({
    name,
    options: options.filter((option) => getStatusOptionGroup(option) === name),
  }));
}

export function getStatusOptionGroup(option: StatusOption) {
  return (
    option.group ??
    defaultStatusOptions.find((defaultOption) => defaultOption.name === option.name)?.group ??
    "To-do"
  );
}

export function getStatusOptions(config: unknown) {
  const options =
    config && typeof config === "object" && "options" in config
      ? (config as DatabasePropertyConfig).options
      : null;

  if (!Array.isArray(options) || options.length === 0) {
    return defaultStatusOptions;
  }

  const validOptions = options.filter(
    (option): option is StatusOption =>
      Boolean(option) &&
      typeof option === "object" &&
      typeof option.id === "string" &&
      typeof option.name === "string",
  );

  return validOptions.length > 0 ? validOptions : defaultStatusOptions;
}

export function reorderStatusGroupOptions(
  options: StatusOption[],
  groupName: string,
  optionIds: string[],
) {
  const reorderedGroupOptions = reorderOptionsByIds(
    options.filter((option) => getStatusOptionGroup(option) === groupName),
    optionIds,
  );
  let nextGroupIndex = 0;

  return options.map((option) => {
    if (getStatusOptionGroup(option) !== groupName) {
      return option;
    }

    const nextOption = reorderedGroupOptions[nextGroupIndex];
    nextGroupIndex += 1;

    return nextOption ?? option;
  });
}
