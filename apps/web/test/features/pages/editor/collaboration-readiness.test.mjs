export function register({ assert, loadModule, readSource, test }) {
  const load = () =>
    loadModule("/src/sections/pages/editor/collaboration/lib/page-document-session.ts");

  test("reload protection follows unacknowledged collaboration changes", async () => {
    const { hasPendingCollaborationChanges } = await load();

    assert.equal(hasPendingCollaborationChanges(undefined), false);
    assert.equal(hasPendingCollaborationChanges({ unsyncedChanges: 0 }), false);
    assert.equal(hasPendingCollaborationChanges({ unsyncedChanges: 1 }), true);
  });

  test("page composition reruns structural recovery when its editor becomes ready", async () => {
    const [editor, pane] = await Promise.all([
      readSource("/src/sections/pages/editor/editor.tsx"),
      readSource("/src/sections/pages/editor/page-content.tsx"),
    ]);

    assert.match(pane, /onEditorReady: handleEditorReady/);
    assert.match(pane, /getEditorHandle,[\s\S]*editorReadyRevision,[\s\S]*navigation/);
    assert.match(editor, /window\.addEventListener\("beforeunload"/);
    assert.match(editor, /hasPendingCollaborationChanges\(collaboration\)/);
  });
}
