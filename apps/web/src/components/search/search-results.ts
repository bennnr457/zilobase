import type { AppSearchResult } from "@zilobase/features/search";

export type SearchResult = AppSearchResult;

export function getSearchResultDestination(result: Pick<SearchResult, "type" | "id">) {
  if (result.type === "database")
    return {
      to: "/d/$databaseId" as const,
      params: { databaseId: result.id },
      search: { view: undefined },
    };
  return { to: "/p/$pageId" as const, params: { pageId: result.id } };
}
