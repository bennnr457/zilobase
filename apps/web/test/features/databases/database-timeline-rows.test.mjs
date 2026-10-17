export function register({ assert, loadModule, readSource, test }) {
  test("timeline name cells stay single-line by default", async () => {
    const sidebar = await readSource(
      "/src/sections/databases/views/timeline/components/database-timeline-sidebar.tsx",
    );

    assert.match(sidebar, /<DatabaseCellContent wrapContent=\{false\}>/);
    assert.doesNotMatch(sidebar, /getNameColumnWrapContent/);
  });

  test("timeline view rows keep New page aligned with its grid row", async () => {
    const { buildTimelineViewRows, getTimelineViewRowHeight } = await loadModule(
      "/src/sections/databases/views/timeline/lib/presentation-model.ts",
    );
    const statusProperty = createProperty("status", "status");
    const firstItem = createItem("row-1");
    const secondItem = createItem("row-2");
    const sections = [
      createSection("not-started", "Not started", [firstItem]),
      createSection("in-progress", "In progress", [secondItem]),
    ];

    const rows = buildTimelineViewRows({
      collapsedGroups: {},
      editable: true,
      groupProperty: statusProperty,
      items: [firstItem, secondItem],
      sections,
    });

    assert.deepEqual(
      rows.map((row) => row.kind),
      ["group-header", "item", "new-page", "group-header", "item", "new-page"],
    );
    assert.equal(rows[2].section.id, "not-started");
    assert.equal(rows[5].section.id, "in-progress");
    assert.equal(getTimelineViewRowHeight(rows[2]), 32);
  });

  test("timeline view rows omit New page for collapsed groups", async () => {
    const { buildTimelineViewRows } = await loadModule(
      "/src/sections/databases/views/timeline/lib/presentation-model.ts",
    );
    const statusProperty = createProperty("status", "status");
    const item = createItem("row-1");
    const rows = buildTimelineViewRows({
      collapsedGroups: { "not-started": true },
      editable: true,
      groupProperty: statusProperty,
      items: [item],
      sections: [createSection("not-started", "Not started", [item])],
    });

    assert.deepEqual(
      rows.map((row) => row.kind),
      ["group-header"],
    );
  });
}

function createItem(id) {
  return {
    id,
    page: { id: `page-${id}`, name: id },
    pageId: `page-${id}`,
  };
}

function createProperty(id, type) {
  return {
    id: `database-property-${id}`,
    property: { config: {}, id: `property-${id}`, name: id, type },
  };
}

function createSection(id, name, rows) {
  return {
    groupValue: name,
    id,
    isEmpty: false,
    name,
    rows,
  };
}
