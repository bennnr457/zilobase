export function register({ assert, readSource, test }) {
  test("feature styles load through the canonical token entrypoint", async () => {
    const [
      main,
      globalStyles,
      featureEntry,
      editorStyles,
      databaseStyles,
      databaseTableStyles,
      editorChromeStyles,
      meetingStyles,
      editorCommentStyles,
    ] = await Promise.all([
      readSource("/src/app/main.tsx"),
      readSource("/src/styles/global.css"),
      readSource("/src/styles/app.css"),
      readSource("/src/features/editor/styles/editor.css"),
      readSource("/src/features/databases/styles/database.css"),
      readSource("/src/features/databases/styles/database-table.css"),
      readSource("/src/features/editor/styles/editor-chrome.css"),
      readSource("/src/features/meetings/styles/meeting.css"),
      readSource("/src/features/editor/styles/editor-comments.css"),
    ]);

    assert.match(globalStyles, /@import "\.\/design-tokens\.css";/);
    assert.ok(main.indexOf("../styles/global.css") < main.indexOf("../styles/app.css"));
    assert.match(
      featureEntry,
      /@import "\.\.\/features\/editor\/styles\/editor\.css";\s*@import "\.\.\/features\/databases\/styles\/database\.css";\s*@import "\.\.\/features\/databases\/styles\/database-table\.css";\s*@import "\.\.\/features\/editor\/styles\/editor-chrome\.css";\s*@import "\.\.\/features\/meetings\/styles\/meeting\.css";\s*@import "\.\.\/features\/editor\/styles\/editor-comments\.css";/,
    );

    for (const styles of [
      editorStyles,
      databaseStyles,
      databaseTableStyles,
      editorChromeStyles,
      meetingStyles,
      editorCommentStyles,
    ]) {
      assert.match(styles, /@reference "\.\.\/\.\.\/\.\.\/styles\/global\.css";/);
      assert.doesNotMatch(styles, /@import "[^"]*design-tokens\.css"/);
    }
  });
}
