type FilesLimitValue = "one_file" | "no_limit";
export function getFilesLimit(config: unknown): FilesLimitValue {
  if (
    config &&
    typeof config === "object" &&
    "filesLimit" in config &&
    (config as { filesLimit?: unknown }).filesLimit === "one_file"
  ) {
    return "one_file";
  }

  return "no_limit";
}

export function getFilesValue(value: string | string[]) {
  if (Array.isArray(value)) {
    return value.filter(
      (file): file is string => typeof file === "string" && file.trim().length > 0,
    );
  }

  return value.trim() ? [value.trim()] : [];
}

export function getFileHref(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue || trimmedValue.startsWith("data:")) {
    return trimmedValue;
  }

  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmedValue);
  const href = hasProtocol ? trimmedValue : `https://${trimmedValue}`;

  try {
    return new URL(href).href;
  } catch {
    return trimmedValue;
  }
}

export function getFileLabel(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "File";
  }

  if (trimmedValue.startsWith("data:")) {
    const mimeType = trimmedValue.slice(5, trimmedValue.indexOf(";"));

    return mimeType.startsWith("image/") ? "Uploaded image" : "Uploaded file";
  }

  const href = getFileHref(trimmedValue);

  try {
    const url = new URL(href);
    const segments = url.pathname.split("/").filter(Boolean);
    const fileName = segments[segments.length - 1];

    return fileName ? decodeURIComponent(fileName) : url.hostname;
  } catch {
    return trimmedValue;
  }
}
