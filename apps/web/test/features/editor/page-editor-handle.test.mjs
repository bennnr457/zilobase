export function register({ assert, loadModule, test }) {
  const load = () => loadModule("/src/features/editor/runtime/page-editor-handle.ts");

  test("editor handle gates writes and reports actual applied content", async () => {
    const { createPageEditorHandle } = await load();
    const changes = [];
    let content = { type: "doc", content: [] };
    const editor = {
      getJSON: () => content,
      commands: {
        setContent: (next) => {
          content = next;
        },
      },
    };
    const denied = createPageEditorHandle({ editable: false, getEditor: () => editor });
    assert.equal(denied.setContentJson({ changed: true }), false);
    const handle = createPageEditorHandle({
      editable: true,
      getEditor: () => editor,
      onContentChange: (next) => changes.push(next),
      isSynchronized: () => false,
    });
    const next = { type: "doc", content: [{ type: "meetingBlock", attrs: { meetingId: "m1" } }] };
    assert.equal(handle.setContentJson(next), true);
    assert.deepEqual(handle.getContentJson(), next);
    assert.deepEqual(changes, [next]);
    assert.equal(handle.isSynchronized(), false);
  });

  test("editor handle follows editor readiness", async () => {
    const { createPageEditorHandle } = await load();
    const handle = createPageEditorHandle({
      editable: true,
      getEditor: () => null,
    });
    assert.equal(handle.setContentJson({}), false);
    assert.equal(handle.getContentJson(), null);
    assert.equal(handle.isSynchronized(), true);
  });
}
