import { getMostRecentItem } from "@zilobase/features/library";
export function getMostRecentItemPath(navigation: Parameters<typeof getMostRecentItem>[0]) {
  const item = getMostRecentItem(navigation);
  if (!item) return null;
  return item.kind === "database"
    ? `/d/${encodeURIComponent(item.id)}`
    : `/p/${encodeURIComponent(item.id)}`;
}
