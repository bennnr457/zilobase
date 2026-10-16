import type { AppSearchResult } from "@zilobase/features/search";

export function getSearchResultDestination(result: Pick<AppSearchResult, "type" | "id">) {
  if (result.type === "database")
    return {
      to: "/d/$databaseId" as const,
      params: { databaseId: result.id },
      search: { view: undefined },
    };
  return { to: "/p/$pageId" as const, params: { pageId: result.id } };
}
