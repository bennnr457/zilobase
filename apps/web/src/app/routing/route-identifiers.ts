export function getPageId(pathname: string) {
  return getRouteItemId(pathname, "p");
}

export function getDatabaseId(pathname: string) {
  return getRouteItemId(pathname, "d");
}

export function getMeetingId(pathname: string) {
  return getRouteItemId(pathname, "m");
}

function getRouteItemId(pathname: string, prefix: "d" | "m" | "p") {
  const match = pathname.match(new RegExp(`^/${prefix}/([^/]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** Copy/open links use the owning database when present, otherwise the page. */
export function getNavigationItemPath({
  databaseId,
  pageId,
}: {
  databaseId?: string | null;
  pageId?: string | null;
}) {
  return databaseId ? `/d/${databaseId}` : `/p/${pageId}`;
}

export function getActivePageId(pathname: string) {
  const match = pathname.match(/^\/p\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function getActiveDatabaseId(pathname: string) {
  const match = pathname.match(/^\/d\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function getActiveMeetingId(pathname: string, search?: unknown) {
  const match = pathname.match(/^\/m\/([^/?#]+)/);
  if (match) return decodeURIComponent(match[1]);

  if (
    search &&
    typeof search === "object" &&
    "meeting" in search &&
    typeof search.meeting === "string"
  ) {
    return search.meeting;
  }

  return typeof search === "string" ? new URLSearchParams(search).get("meeting") : null;
}

export function getActiveDatabaseViewId(search: unknown) {
  if (search && typeof search === "object" && "view" in search && typeof search.view === "string") {
    return search.view;
  }

  return typeof search === "string" ? new URLSearchParams(search).get("view") : null;
}
