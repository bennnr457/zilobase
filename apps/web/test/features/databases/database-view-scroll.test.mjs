export function register({ assert, loadModule, test }) {
  test("database tables ignore horizontal-only scroll containers", async () => {
    const { isVerticalScrollContainer } = await loadModule(
      "/src/sections/databases/views/controller/lib/database-view-scroll.ts",
    );

    assert.equal(
      isVerticalScrollContainer({
        clientHeight: 40,
        overflowY: "auto",
        scrollHeight: 40,
      }),
      false,
    );
  });

  test("database tables identify vertical page scroll containers", async () => {
    const { isVerticalScrollContainer } = await loadModule(
      "/src/sections/databases/views/controller/lib/database-view-scroll.ts",
    );
    for (const overflowY of ["auto", "overlay", "scroll"]) {
      assert.equal(
        isVerticalScrollContainer({ clientHeight: 800, overflowY, scrollHeight: 1800 }),
        true,
      );
    }
    assert.equal(
      isVerticalScrollContainer({ clientHeight: 800, overflowY: "visible", scrollHeight: 1800 }),
      false,
    );
  });

  test("table rows stay mounted until page virtualization is ready", async () => {
    const { shouldRenderVirtualizedDatabaseRows } = await loadModule(
      "/src/sections/databases/views/controller/lib/database-view-scroll.ts",
    );

    assert.equal(
      shouldRenderVirtualizedDatabaseRows({
        hasScrollElement: false,
        virtualRowCount: 0,
        virtualizationEnabled: true,
      }),
      false,
    );
    assert.equal(
      shouldRenderVirtualizedDatabaseRows({
        hasScrollElement: true,
        virtualRowCount: 8,
        virtualizationEnabled: true,
      }),
      true,
    );
  });
}
