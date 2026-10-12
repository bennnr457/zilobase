type ReadSnapshot = {
  scope: string;
  queryKey: unknown[];
  data: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function pageReadSnapshotOf(
  queryKey: readonly unknown[],
  data: unknown,
  _sessionId: string,
): ReadSnapshot | null {
  const key = [...queryKey];
  if (key[0] === "meetings" && key[1] === "list" && typeof key[2] === "string") {
    if (!isObject(data) || !Array.isArray(data.meetings)) return null;
    return { scope: `workspace:${key[2]}`, queryKey: key, data };
  }
  if (key[0] === "user-settings" && key.length === 1) {
    if (!isObject(data)) return null;
    return { scope: "user", queryKey: key, data };
  }
  if (
    key[0] === "page-layouts" &&
    key[1] === "resolved" &&
    typeof key[2] === "string" &&
    key[2] !== "none"
  ) {
    if (!isObject(data) || !isObject(data.config) || data.pageId !== key[2]) return null;
    return { scope: `page:${key[2]}`, queryKey: key, data };
  }
  if (key[0] === "page" && typeof key[1] === "string" && key[1] !== "none") {
    if (
      key[2] === "access-targets" &&
      isObject(data) &&
      Array.isArray(data.guests) &&
      Array.isArray(data.members)
    ) {
      return { scope: `page:${key[1]}`, queryKey: key, data };
    }
  }
  // Shared entity references belong to one active data session and cannot hydrate.
  return null;
}
