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
      readSource("/src/components/pages/editor/styles/editor.css"),
      readSource("/src/components/databases/styles/database.css"),
      readSource("/src/components/databases/styles/database-table.css"),
      readSource("/src/components/pages/editor/styles/editor-chrome.css"),
      readSource("/src/components/meetings/styles/meeting.css"),
      readSource("/src/components/pages/editor/styles/editor-comments.css"),
    ]);

    assert.match(globalStyles, /@import "\.\/design-tokens\.css";/);
    assert.ok(main.indexOf("../styles/global.css") < main.indexOf("../styles/app.css"));
    assert.match(
      featureEntry,
      /@import "\.\.\/components\/pages\/editor\/styles\/editor\.css";\s*@import "\.\.\/components\/databases\/styles\/database\.css";\s*@import "\.\.\/components\/databases\/styles\/database-table\.css";\s*@import "\.\.\/components\/pages\/editor\/styles\/editor-chrome\.css";\s*@import "\.\.\/components\/meetings\/styles\/meeting\.css";\s*@import "\.\.\/components\/pages\/editor\/styles\/editor-comments\.css";/,
    );

    for (const styles of [
      editorStyles,
      databaseStyles,
      databaseTableStyles,
      editorChromeStyles,
      meetingStyles,
      editorCommentStyles,
    ]) {
      assert.match(styles, /@reference "(?:\.\.\/){3,4}styles\/global\.css";/);
      assert.doesNotMatch(styles, /@import "[^"]*design-tokens\.css"/);
    }
  });
}
