import {
  buildHomepageViewData as deriveHomepageViewData,
  buildHomepageRows as deriveHomepageRows,
  libraryParentPropertyId,
  type RecentsMode,
  getMostRecentItem,
} from "@zilobase/features/library";
import { DEFAULT_MEETING_ITEM_ICON } from "@/components/pages/icons/item-icons";
import type { DatabaseViewData } from "@zilobase/features/databases";
import type { MeetingListItem } from "@zilobase/features/meetings";
import type { Teamspace } from "@zilobase/features/teamspaces";
import type { PageNavigationPayload } from "@zilobase/features/pages";
import { libraryViewIds } from "@zilobase/features/user-settings";
import { libraryViewLabels } from "@/app/shell/navigation/model/sidebar-layout-model";
export {
  libraryParentPropertyId,
  getHomepageRowType,
  buildTeamspaceLibraryRows,
  isHomepageView,
  applyHomepageView,
  includeHomepageDescendants,
} from "@zilobase/features/library";

export type { HomepageView, HomepageRow, RecentsMode } from "@zilobase/features/library";

export const homepageViews = libraryViewIds.map((id) => ({ id, label: libraryViewLabels[id] }));

export function buildHomepageRows(
  navigation: PageNavigationPayload,
  meetings: MeetingListItem[],
  mode: RecentsMode,
  teamspaces: Teamspace[] = [],
) {
  return deriveHomepageRows(navigation, meetings, mode, teamspaces, DEFAULT_MEETING_ITEM_ICON);
}

const homepagePropertyWidths: Record<string, number> = {
  source: 220,
  createdBy: 190,
  lastVisitedAt: 210,
  updatedAt: 210,
  createdAt: 210,
  [libraryParentPropertyId]: 220,
  deletedAt: 210,
  deletedBy: 190,
};

export function buildHomepageViewData(
  input: Omit<Parameters<typeof deriveHomepageViewData>[0], "views">,
): DatabaseViewData {
  const data = deriveHomepageViewData({ ...input, views: homepageViews });
  return {
    ...data,
    bootstrap: {
      ...data.bootstrap,
      properties: data.bootstrap.properties.map((property) => ({
        ...property,
        width: homepagePropertyWidths[property.id],
      })),
    },
  };
}

export function getMostRecentItemPath(navigation: Parameters<typeof getMostRecentItem>[0]) {
  const item = getMostRecentItem(navigation);
  if (!item) return null;
  return item.kind === "database"
    ? `/d/${encodeURIComponent(item.id)}`
    : `/p/${encodeURIComponent(item.id)}`;
}
