export function register({ assert, readSource, test }) {
  test("database views share the record window boundary", async () => {
    const control = await readSource(
      "/src/components/databases/views/shared/database-record-window-control.tsx",
    );
    const list = await readSource("/src/components/databases/views/list/database-list-view.tsx");
    const gallery = await readSource(
      "/src/components/databases/views/gallery/database-gallery-view.tsx",
    );
    const timeline = await readSource(
      "/src/components/databases/views/timeline/database-timeline-view.tsx",
    );
    const chart = await readSource("/src/components/databases/views/chart/database-chart-view.tsx");

    assert.match(control, /useDatabaseRowsScroll/);
    assert.match(control, /Load more rows/);
    assert.match(list, /<DatabaseRecordWindowControl automatic \/>/);
    assert.match(gallery, /<DatabaseRecordWindowControl automatic \/>/);
    assert.match(timeline, /<DatabaseRecordWindowControl \/>/);
    assert.match(chart, /<DatabaseRecordWindowControl \/>/);
  });

  test("remaining views consume collection-composed context without mutation locks", async () => {
    const paths = [
      "/src/components/databases/views/list/database-list-view.tsx",
      "/src/components/databases/views/gallery/database-gallery-view.tsx",
      "/src/components/databases/views/timeline/database-timeline-view.tsx",
      "/src/components/databases/views/chart/database-chart-view.tsx",
      "/src/components/databases/views/form/database-form-view.tsx",
    ];

    for (const path of paths) {
      const source = await readSource(path);
      assert.match(source, /useDatabaseDataContext/);
      assert.doesNotMatch(source, /DatabasePayload/);
      assert.doesNotMatch(source, /isAddingDatabaseRow/);
    }

    const form = await readSource(paths.at(-1));
    assert.doesNotMatch(form, /\n\s+(filteredItems|items|sortedItems),/);
  });
}
