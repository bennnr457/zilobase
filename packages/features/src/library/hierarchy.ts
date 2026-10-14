import type {
  PageItemPlacement,
  Page,
  PageDatabase,
  PageNavigationPayload,
} from "../pages/contracts";
export type HomepageHierarchy = {
  parentRowIdByRowId: Record<string, string>;
  positionByRowId: Record<string, number>;
};

export function buildHomepageHierarchy(placements: PageItemPlacement[]): HomepageHierarchy {
  const canonicalPlacements = [...placements]
    .filter(
      (placement) =>
        placement.itemKind !== placement.parentKind || placement.itemId !== placement.parentId,
    )
    .sort(
      (left, right) =>
        getPlacementPriority(left) - getPlacementPriority(right) ||
        left.position - right.position ||
        left.id.localeCompare(right.id),
    );
  const parentRowIdByRowId: Record<string, string> = {};
  const positionByRowId: Record<string, number> = {};

  for (const placement of canonicalPlacements) {
    const rowId = getPlacementRowId(placement.itemKind, placement.itemId);

    if (parentRowIdByRowId[rowId]) continue;

    parentRowIdByRowId[rowId] = getPlacementRowId(placement.parentKind, placement.parentId);
    positionByRowId[rowId] = placement.position;
  }

  return { parentRowIdByRowId, positionByRowId };
}

function getPlacementPriority(placement: PageItemPlacement) {
  if (placement.placementKind === "primary") return 0;
  if (placement.placementKind === "database_row") return 1;
  return 2;
}

function getPlacementRowId(kind: "database" | "page", id: string) {
  return `${kind}:${id}`;
}

type RecentItem = {
  id: string;
  kind: "database" | "page";
  lastVisitedAt?: string | null;
};

export function getMostRecentItem(navigation: Pick<PageNavigationPayload, "databases" | "pages">) {
  const items: RecentItem[] = [
    ...navigation.pages.filter(isActivePage).map((page) => ({
      id: page.id,
      kind: "page" as const,
      lastVisitedAt: page.lastVisitedAt,
    })),
    ...navigation.databases.filter(isActiveDatabase).map((database) => ({
      id: database.id,
      kind: "database" as const,
      lastVisitedAt: database.lastVisitedAt,
    })),
  ];

  const mostRecent = items.reduce<RecentItem | null>((current, item) => {
    const itemTime = getTime(item.lastVisitedAt);
    if (!itemTime) return current;
    return !current || itemTime > getTime(current.lastVisitedAt) ? item : current;
  }, null);

  return mostRecent;
}

function isActivePage(page: Page) {
  return !page.deletedAt && page.type !== "meeting";
}

function isActiveDatabase(database: PageDatabase) {
  return !database.deletedAt;
}

function getTime(value: string | null | undefined) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}
