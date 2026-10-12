import type { DatabasePropertyConfig } from "../views/configuration";
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
