export function register({ assert, readSource, test }) {
  test("sidebar primitives expose only the supported Zilobase layout", async () => {
    const source = await readSource("/src/components/ui/sidebar.tsx");

    for (const removedComponent of [
      "SidebarInput",
      "SidebarMenuSkeleton",
      "SidebarMenuSub",
      "SidebarRail",
      "SidebarSeparator",
    ]) {
      assert.doesNotMatch(source, new RegExp(`function ${removedComponent}\\b`));
    }

    assert.doesNotMatch(source, /side\?: "left" \| "right"/);
    assert.doesNotMatch(source, /variant\?: "sidebar"/);
    assert.match(source, /collapsible\?: "offcanvas"/);
    assert.doesNotMatch(source, /sidebar_state|document\.cookie/);
    assert.doesNotMatch(source, /class-variance-authority|Tooltip/);

    assert.match(source, /"--sidebar-width": DEFAULT_SIDEBAR_WIDTH/);
    assert.match(source, /"--sidebar-width-mobile"/);
    assert.match(source, /actions\?: React\.ReactNode/);
    assert.match(source, /navigation\?: React\.ReactNode/);
    assert.match(source, /<Sheet open=\{openMobile\} onOpenChange=\{setOpenMobile\}>/);
    assert.match(source, /side="left"/);
    assert.match(source, /group-data-\[collapsible=offcanvas\]:w-0/);
    assert.match(source, /group-data-\[collapsible=offcanvas\]:left-/);
    assert.match(source, /inert=\{!open\}/);
    assert.doesNotMatch(source, /addEventListener\("keydown"/);
  });
}
