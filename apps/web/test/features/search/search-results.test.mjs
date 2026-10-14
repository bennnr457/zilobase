export function register({ assert, loadModule, test }) {
  test("search preserves page and database result destinations", async () => {
    const { getSearchResultDestination } = await loadModule(
      "/src/components/search/search-results.ts",
    );
    assert.deepEqual(getSearchResultDestination({ type: "database", id: "db" }), {
      to: "/d/$databaseId",
      params: { databaseId: "db" },
      search: { view: undefined },
    });
    assert.deepEqual(getSearchResultDestination({ type: "page", id: "page" }), {
      to: "/p/$pageId",
      params: { pageId: "page" },
    });
  });
}
