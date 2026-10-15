export function register({ assert, loadModule, readSource, test }) {
  const load = () => loadModule("/src/components/editor/collaboration/collaboration-readiness.ts");

  test("reload protection follows unacknowledged collaboration changes", async () => {
    const { hasPendingCollaborationChanges } = await load();

    assert.equal(hasPendingCollaborationChanges(undefined), false);
    assert.equal(hasPendingCollaborationChanges({ unsyncedChanges: 0 }), false);
    assert.equal(hasPendingCollaborationChanges({ unsyncedChanges: 1 }), true);
  });

  test("page composition reruns structural recovery when its editor becomes ready", async () => {
    const [editor, pane] = await Promise.all([
      readSource("/src/components/editor/composition/editor.tsx"),
      readSource("/src/components/pages/content/page-content.tsx"),
    ]);

    assert.match(pane, /onEditorReady: handleEditorReady/);
    assert.match(pane, /getEditorHandle,[\s\S]*editorReadyRevision,[\s\S]*navigation/);
    assert.match(editor, /window\.addEventListener\("beforeunload"/);
    assert.match(editor, /hasPendingCollaborationChanges\(collaboration\)/);
  });
}
