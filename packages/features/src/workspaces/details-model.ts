export function isValidWorkspaceSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function isValidWorkspaceLogoUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
