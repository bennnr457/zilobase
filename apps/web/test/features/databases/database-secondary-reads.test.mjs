export function register({ assert, readSource, readWorkspace, test }) {
  test("secondary database reads separate metadata from bounded record windows", async () => {
    const hook = await readSource("/packages/features/src/databases/queries/metadata.ts");

    assert.match(hook, /useDatabaseMetadata\(databaseId/);
    assert.match(hook, /useDatabaseRecords\(/);
    assert.match(hook, /records\.fetchNextPage\(\)/);
    assert.match(hook, /options\?\.enabled/);
    assert.match(hook, /options\?\.loadAll/);
    assert.doesNotMatch(hook, /schemaOnly: true/);
  });

  test("schema consumers do not request related record payloads", async () => {
    const [relation, rollup, propertyMenu] = await Promise.all([
      readSource(
        "/src/components/databases/schema/configuration/relation/relation-property-settings.tsx",
      ),
      readSource(
        "/src/components/databases/schema/configuration/rollup/rollup-property-settings.tsx",
      ),
      readSource("/src/components/databases/schema/editors/database-property-menu.tsx"),
    ]);

    assert.match(relation, /useDatabaseMetadata\(selectedDatabaseId\)/);
    assert.match(relation, /enabled: repairDialogOpen/);
    assert.match(relation, /disabled=\{repairDataLoading\}/);
    assert.doesNotMatch(rollup, /useDatabase\(/);
    assert.match(rollup, /useDatabaseMetadata\(\s*relationConfig\.relatedDatabaseId,?\s*\)/);
    assert.doesNotMatch(propertyMenu, /useDatabase\(/);
  });

  test("relation values page record choices instead of loading full windows", async () => {
    const source = await readSource(
      "/src/components/databases/schema/editors/database-derived-property-value.tsx",
    );

    assert.doesNotMatch(source, /useDatabase\(/);
    assert.match(source, /useDatabaseSecondaryPayload\(/);
    assert.match(source, /Load more pages/);
    assert.match(source, /\{\s*loadAll:\s*true,?\s*\}/);
  });

  test("row page properties use the targeted page endpoint", async () => {
    const source = await readWorkspace("/packages/features/src/pages/query-hooks.ts");
    const hook = source.slice(source.indexOf("export function usePageProperties"));

    assert.match(hook, /pagePropertiesQueryOptions\(apiFetch, pageId\)/);
    assert.doesNotMatch(hook, /useDatabase\(/);
    assert.doesNotMatch(hook, /buildPagePropertiesPayloadFromDatabase/);
  });
}
