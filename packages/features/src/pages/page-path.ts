import { getPrimaryPageParentId } from "./queries";
import { type Page, type PageItemPlacement } from "./contracts";

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
