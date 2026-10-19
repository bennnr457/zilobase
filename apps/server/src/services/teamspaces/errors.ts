export function getDatabaseErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
}
