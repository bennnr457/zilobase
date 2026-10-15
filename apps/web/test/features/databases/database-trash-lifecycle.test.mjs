export function register({ assert, readSource, readWorkspace, test }) {
  test("deleted embedded databases are purged while full-page trash remains restorable", async () => {
    const [block, controller, screen, view, toolbarActions, restoreButton, styles, cache] =
      await Promise.all([
        readSource("/src/components/databases/blocks/database-block.tsx"),
        Promise.all([
          readSource("/src/components/databases/views/controller/use-database-view-controller.tsx"),
          readSource("/packages/features/src/databases/records/source-commands.ts"),
          readSource("/packages/features/src/databases/queries/view-data.ts"),
        ]).then((parts) => parts.join("\n")),
        readSource("/src/components/databases/screen/database-screen.tsx"),
        readSource("/src/components/databases/views/shared/database-view.tsx"),
        readSource("/src/components/databases/views/shared/database-toolbar-actions.tsx"),
        readSource("/src/components/databases/screen/database-trash-restore-button.tsx"),
        readSource("/src/components/databases/styles/database.css"),
        readWorkspace("/packages/features/src/shared/item-action-cache.ts"),
      ]);

    assert.match(block, /hideWhenDeleted/);
    assert.match(block, /includeDeleted/);
    assert.match(block, /onDeleted=\{removeDeletedBlock\}/);
    assert.match(block, /setMeta\("addToHistory", false\)/);
    assert.match(styles, /node-databaseBlock:has\(\[data-database-deleted="true"\]\)/);
    assert.doesNotMatch(block, /canRestoreDeleted=/);
    assert.doesNotMatch(block, /includeDeleted=\{isEditable\}/);
    assert.match(controller, /Boolean\(bootstrap\?\.database\.deletedAt\)/);
    assert.match(
      controller,
      /databaseId && !databaseDeleted && activeViewId && activeDataSourceId/,
    );
    assert.match(controller, /realtimeEnabled: Boolean\(bootstrap\) && !databaseDeleted/);
    assert.match(controller, /requestedEditable\s*&&\s*!databaseDeleted\s*&&\s*!isDatabaseLocked/);
    assert.match(view, /!databaseDeleted \? \([\s\S]*?className="database-scroll-section"/);
    assert.match(view, /databaseDeleted && props\.hideWhenDeleted === true/);
    assert.match(view, /if \(hiddenDeletedDatabase\) props\.onDeleted\?\.\(\)/);
    assert.match(view, /data-database-deleted="true"/);
    assert.match(view, /deletedDatabaseId=\{databaseDeleted \? databaseId : null\}/);
    assert.match(toolbarActions, /<DatabaseTrashRestoreButton/);
    assert.match(toolbarActions, /editable \? \([\s\S]*?\) : canRestoreDeleted/);
    assert.match(restoreButton, /className="database-new-button"/);
    assert.doesNotMatch(restoreButton, /TrashedItemBanner/);
    assert.match(screen, /Boolean\(payload\?\.database\.deletedAt\)/);
    assert.match(screen, /canRestoreDeleted=\{!readOnly\}/);
    assert.doesNotMatch(screen, /\{databasePage\?\.deletedAt \? \(/);
    assert.doesNotMatch(screen, /<DatabaseTrashBanner/);
    assert.match(cache, /query\.queryKey\[query\.queryKey\.length - 1\] === true/);
  });
}
