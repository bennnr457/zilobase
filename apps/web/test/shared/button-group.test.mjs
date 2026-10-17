export function register({ assert, loadModule, readSource, test }) {
  test("button groups expose shared layout variants instead of feature styles", async () => {
    const { buttonGroupItemVariants, buttonGroupVariants } = await loadModule(
      "/apps/web/src/components/ui/button-group.tsx",
    );

    const connected = buttonGroupVariants({ variant: "connected" });
    assert.match(connected, /rounded-l-none/);
    assert.match(connected, /border-l-0/);

    const floating = buttonGroupVariants({ variant: "floating" });
    assert.match(floating, /bg-surface-overlay/);
    assert.match(floating, /shadow-lg/);
    assert.match(floating, /gap-1/);

    const selection = buttonGroupVariants({ variant: "segmented" });
    assert.match(selection, /h-7/);
    assert.match(selection, /border-stroke-default/);
    assert.doesNotMatch(selection, /h-9|text-sm|px-3/);
    assert.match(buttonGroupItemVariants({ layout: "icon" }), /size-7/);

    assert.match(buttonGroupVariants({ width: "full" }), /w-full/);
  });

  test("editor and database toolbars select shared button group variants", async () => {
    const [selectionBubbleMenu, databaseSelectionToolbar, editorStyles] = await Promise.all([
      readSource("/src/sections/pages/editor/selection/components/selection-bubble-menu.tsx"),
      readSource("/src/sections/databases/views/shared/components/database-selection-toolbar.tsx"),
      readSource("/src/sections/pages/editor/styles/editor-chrome.css"),
    ]);

    assert.match(selectionBubbleMenu, /variant="floating"/);
    assert.match(databaseSelectionToolbar, /variant="segmented"/);
    assert.match(databaseSelectionToolbar, /ButtonGroupItem/);
    assert.doesNotMatch(editorStyles, /\.selection-toolbar\s*\{/);
  });
}
