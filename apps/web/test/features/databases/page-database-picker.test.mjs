export function register({ assert, loadModule, readSource, test }) {
  test("page and database picker search is normalized and relevance ranked", async () => {
    const { filterPageDatabasePickerOptions } = await loadModule(
      "/packages/features/src/databases/views/picker-search.ts",
    );
    const options = [
      { label: "Project Decaféteria", value: "contains" },
      { label: "Café planning", value: "starts" },
      {
        label: "Quarterly plan",
        searchText: "Quarterly plan Café",
        value: "word",
      },
      { label: "Unrelated", value: "none" },
    ];

    assert.deepEqual(
      filterPageDatabasePickerOptions(options, "  CAFE ").map((option) => option.value),
      ["starts", "word", "contains"],
    );
    assert.strictEqual(filterPageDatabasePickerOptions(options, ""), options);
  });

  test("page and database selectors use the shared picker", async () => {
    const sources = await Promise.all([
      readSource(
        "/src/components/databases/properties/editors/database-derived-property-value.tsx",
      ),
      readSource(
        "/src/components/databases/properties/configuration/relation-property-settings.tsx",
      ),
      readSource("/src/components/databases/views/settings/data-source-settings.tsx"),
      readSource("/src/components/databases/views/shared/linked-data-source-picker.tsx"),
      readSource("/src/components/databases/setup/database-setup-card.tsx"),
      readSource("/src/app/shell/sidebar/sidebar-customization.tsx"),
    ]);

    for (const source of sources) {
      assert.match(source, /PageDatabasePicker/);
    }

    assert.doesNotMatch(sources[0], /className="database-select-option"/);
  });
}
