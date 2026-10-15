export function register({ assert, loadModule, readSource, test }) {
  test("pages default icons to the top while preserving explicit inline positions", async () => {
    const { getPageIconPosition } = await loadModule("/packages/features/src/pages/queries.ts");

    assert.equal(getPageIconPosition({ metadata: null }), "top");
    assert.equal(getPageIconPosition({ metadata: {} }), "top");
    assert.equal(getPageIconPosition({ metadata: { iconPosition: "top" } }), "top");
    assert.equal(getPageIconPosition({ metadata: { iconPosition: "inline" } }), "inline");
  });

  test("shared headers preserve page icon spacing and force database icons inline through props", async () => {
    const [metadataSource, databaseSource, pageEditorSource] = await Promise.all([
      readSource("/src/components/databases/page-properties/page-metadata.tsx"),
      readSource("/src/components/databases/screen/database-screen.tsx"),
      readSource("/src/components/pages/content/page-content.tsx"),
    ]);

    assert.match(metadataSource, /: "mb-1 w-fit"/);
    assert.match(metadataSource, /relative z-10 -mb-9 w-fit -translate-y-1\/2/);
    assert.equal(
      metadataSource.match(/allowIconPositionChange \? updateIconPosition : undefined/g)?.length,
      2,
    );
    assert.match(databaseSource, /allowIconPositionChange=\{false\}/);
    assert.match(databaseSource, /iconPosition="inline"/);
    assert.doesNotMatch(databaseSource, /onIconPositionChange=/);
    assert.match(databaseSource, /enableComments=\{false\}/);
    assert.match(databaseSource, /description=\{description\}/);
    assert.match(databaseSource, /descriptionInitiallyHidden/);
    assert.match(databaseSource, /onDescriptionChange=\{setDescription\}/);
    assert.match(pageEditorSource, /const nextIconPosition = nextEmoji \? iconPosition : "top"/);
    assert.match(pageEditorSource, /iconPosition: nextIconPosition/);
  });
}
