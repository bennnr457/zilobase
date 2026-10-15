export function register({ assert, readSource, readWorkspace, test }) {
  test("database metadata facade uses bootstrap for authenticated and public reads", async () => {
    const hook = await readSource("/packages/features/src/databases/queries/metadata.ts");
    const bootstrapHook = await readWorkspace(
      "/packages/features/src/databases/queries/bootstrap.ts",
    );

    assert.match(hook, /useDatabaseBootstrap/);
    assert.doesNotMatch(hook, /\buseDatabase\(/);
    assert.match(bootstrapHook, /useDatabaseSessionId/);
    assert.match(bootstrapHook, /databaseBootstrapQueryOptions/);
    assert.match(bootstrapHook, /useQuery/);
  });

  test("metadata-only application consumers no longer request database payloads", async () => {
    const paths = [
      "/src/app/shell/document-favicon.tsx",
      "/src/app/shell/app-layout.tsx",
      "/packages/features/src/pages/sharing-hooks.ts",
      "/packages/features/src/pages/item-action-hooks.ts",
      "/src/components/databases/setup/components/database-setup-card.tsx",
      "/src/components/databases/views/view-settings/data-source-settings.tsx",
    ];

    for (const path of paths) {
      const source = await readSource(path);
      assert.match(source, /useDatabaseMetadata/);
      assert.doesNotMatch(source, /\buseDatabase\(/);
    }
    const sharing = await readSource("/src/components/sharing/use-sharing.ts");
    assert.match(sharing, /useItemSharingController/);
    assert.doesNotMatch(sharing, /\buseDatabase\(/);
  });

  test("sidebar and layout previews use bounded record windows", async () => {
    const sidebar = await readSource("/src/app/shell/sidebar/sidebar-controller.ts");
    const layout = await readSource("/src/components/pages/design/page-design-editor.tsx");
    const pane = await readSource("/src/components/navigation/breadcrumbs.tsx");

    assert.match(sidebar, /useDatabaseRecords/);
    assert.match(sidebar, /composeDatabaseViewData/);
    assert.doesNotMatch(sidebar, /disabled=\{addRow\.isPending\}/);
    assert.match(layout, /useDatabaseRecords/);
    assert.match(layout, /Load more pages/);
    assert.match(pane, /function DatabaseBreadcrumb[\s\S]*useDatabaseBootstrap/);
    assert.doesNotMatch(pane, /@\/components\/databases\/hooks\/use-database-/);
  });
}
