import type { Page, PageDatabase, PageItemPlacement, PageNavigationPayload } from "./contracts";
import type { SidebarNavItem } from "./sidebar-nav-item";
import type { SidebarSectionId, SidebarSectionSort } from "../user-settings/index";
export type BreadcrumbNavigationItem =
  | { id: string; kind: "page"; page: Page }
  | { database: PageDatabase; id: string; kind: "database" };

export type BreadcrumbNavigationSection =
  | { kind: "private"; label: "Private" }
  | { kind: "shared"; label: "Shared" }
  | { kind: "teamspace"; label: string; teamspaceId: string };

export function buildCanonicalBreadcrumbTrail(
  item: { id: string; kind: "page" | "database" },
  pages: Page[],
  databases: PageDatabase[],
  placements: PageItemPlacement[],
) {
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const databasesById = new Map(databases.map((database) => [database.id, database]));
  const trail: BreadcrumbNavigationItem[] = [];
  const visited = new Set<string>();
  let current: typeof item | undefined = item;

  while (current) {
    const visitKey = `${current.kind}:${current.id}`;
    if (visited.has(visitKey)) break;
    visited.add(visitKey);

    if (current.kind === "page") {
      const page = pagesById.get(current.id);
      if (!page) break;
      trail.unshift({ id: page.id, kind: "page", page });
    } else {
      const database = databasesById.get(current.id);
      if (!database) break;
      trail.unshift({ database, id: database.id, kind: "database" });
    }

    const placement = getCanonicalPlacement(placements, current);
    current = placement ? { id: placement.parentId, kind: placement.parentKind } : undefined;
  }

  return trail;
}

export function getBreadcrumbNavigationSection(
  trail: BreadcrumbNavigationItem[],
  teamspaceNames: ReadonlyMap<string, string>,
): BreadcrumbNavigationSection {
  const root = trail[0];
  const teamspaceId = root?.kind === "page" ? root.page.teamspaceId : root?.database.teamspaceId;

  if (teamspaceId) {
    return {
      kind: "teamspace",
      label: teamspaceNames.get(teamspaceId)?.trim() || "Teamspace",
      teamspaceId,
    };
  }

  const isShared = root?.kind === "page" && Boolean(root.page.isShared);
  return isShared ? { kind: "shared", label: "Shared" } : { kind: "private", label: "Private" };
}

function getCanonicalPlacement(
  placements: PageItemPlacement[],
  item: { id: string; kind: "page" | "database" },
) {
  const candidates = placements.filter(
    (placement) =>
      placement.itemKind === item.kind &&
      placement.itemId === item.id &&
      placement.placementKind !== "linked",
  );

  return (
    candidates.find((placement) => placement.placementKind === "primary") ??
    candidates.find((placement) => placement.placementKind === "database_row")
  );
}

export function buildPagePath(
  pagesById: Map<string, Page>,
  pageId: string,
  placements: PageItemPlacement[],
) {
  const parts: string[] = [];
  const visited = new Set<string>();
  let current = pagesById.get(pageId);

  while (current) {
    if (visited.has(current.id)) {
      break;
    }

    visited.add(current.id);
    parts.unshift(current.name.trim() || "Untitled");

    const parentItemId = getPrimaryPageParentId(placements, current.id);

    if (!parentItemId) {
      break;
    }

    current = pagesById.get(parentItemId);
  }

  return parts.join(" / ");
}

export function getConfiguredSidebarItems<Icon>(
  items: SidebarNavItem<Icon>[],
  sectionId: SidebarSectionId,
  presentation: { limit: number; sort: SidebarSectionSort },
) {
  const sorted = [...items].sort((first, second) => {
    if (presentation.sort === "alphabetical") {
      return getDisplayName(first).localeCompare(getDisplayName(second), undefined, {
        sensitivity: "base",
      });
    }

    if (sectionId === "recents") {
      return getTime(second.lastVisitedAt) - getTime(first.lastVisitedAt);
    }

    return getTime(second.updatedAt) - getTime(first.updatedAt);
  });

  return sorted.slice(0, presentation.limit);
}

function getDisplayName(item: SidebarNavItem) {
  return item.name.trim() || "Untitled";
}

function getTime(value: string | null | undefined) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

export type NavDelta = {
  removeDatabaseIds?: string[];
  removePlacementIds?: string[];
  removePageIds?: string[];
  upsertDatabases?: Omit<PageDatabase, "actorState" | "isFavorite" | "metadataState">[];
  upsertPlacements?: PageItemPlacement[];
  upsertPages?: Page[];
};

function upsertById<T extends { id: string }>(items: T[] | undefined, next: T) {
  const result = [...(items ?? [])];
  const index = result.findIndex((item) => item.id === next.id);

  if (index >= 0) {
    result[index] = { ...result[index], ...next };
  } else {
    result.push(next);
  }

  return result;
}

function removeByIds<T extends { id: string }>(items: T[] | undefined, ids: Set<string>) {
  return (items ?? []).filter((item) => !ids.has(item.id));
}

export function applyNavDelta(
  navigation: PageNavigationPayload | undefined,
  delta: NavDelta | null | undefined,
) {
  if (!navigation || !delta) {
    return navigation;
  }

  const removePageIds = new Set(delta.removePageIds ?? []);
  const removePlacementIds = new Set(delta.removePlacementIds ?? []);
  let pages = navigation.pages.filter((page) => !removePageIds.has(page.id));
  const databases = navigation.databases;
  let placements = removeByIds(navigation.placements, removePlacementIds);

  for (const page of delta.upsertPages ?? []) {
    pages = upsertById(pages, page);
  }

  // Database deltas have no atomic revision envelope. Their owning adapter
  // refreshes GET snapshots; only controller intentions may project over them.

  for (const placement of delta.upsertPlacements ?? []) {
    placements = upsertById(placements, placement);
  }

  return { databases, pages, placements };
}

export function applyItemVisitToNav(
  navigation: PageNavigationPayload | undefined,
  visit: {
    itemId: string;
    itemKind: "database" | "page";
    lastVisitedAt: string;
  },
) {
  if (!navigation) {
    return navigation;
  }

  if (visit.itemKind === "page") {
    return {
      ...navigation,
      pages: navigation.pages.map((page) =>
        page.id === visit.itemId ? { ...page, lastVisitedAt: visit.lastVisitedAt } : page,
      ),
    };
  }

  return {
    ...navigation,
    databases: navigation.databases.map((database) =>
      database.id === visit.itemId ? { ...database, lastVisitedAt: visit.lastVisitedAt } : database,
    ),
  };
}

export function applyPageFavoriteToNav(navigation: PageNavigationPayload | undefined, page: Page) {
  if (!navigation) {
    return navigation;
  }

  return {
    ...navigation,
    pages: navigation.pages.map((current) =>
      current.id === page.id ? { ...current, ...page, isFavorite: page.isFavorite } : current,
    ),
  };
}

export function getPrimaryPageParentId(placements: PageItemPlacement[], pageId: string) {
  return (
    placements.find(
      (placement) =>
        placement.itemKind === "page" &&
        placement.itemId === pageId &&
        placement.placementKind === "primary",
    )?.parentId ?? null
  );
}
