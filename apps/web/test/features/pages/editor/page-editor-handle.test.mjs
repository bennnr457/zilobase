export function register({ assert, loadModule, test }) {
  const load = () => loadModule("/src/sections/pages/editor/runtime/lib/page-editor-handle.ts");

  test("editor handle gates writes and reports actual applied content", async () => {
    const { createPageEditorHandle } = await load();
    const changes = [];
    const { Schema } = await import("@tiptap/pm/model");
    const { EditorState } = await import("@tiptap/pm/state");
    const schema = new Schema({
      nodes: {
        doc: { content: "block+" },
        text: {},
        paragraph: { group: "block", content: "text*" },
        meetingBlock: { group: "block", atom: true, attrs: { meetingId: { default: null } } },
      },
    });
    let state = EditorState.create({ schema });
    const listeners = new Map();
    const editor = {
      schema,
      isEditable: true,
      get state() {
        return state;
      },
      getJSON: () => JSON.parse(JSON.stringify(state.doc.toJSON())),
      on: (event, listener) => {
        const set = listeners.get(event) ?? new Set();
        set.add(listener);
        listeners.set(event, set);
      },
      off: (event, listener) => listeners.get(event)?.delete(listener),
      view: {
        dispatch: (transaction) => {
          const nextState = state.apply(transaction);
          for (const listener of listeners.get("beforeTransaction") ?? [])
            listener({ transaction, nextState });
          state = nextState;
          for (const listener of listeners.get("transaction") ?? []) listener({ transaction });
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
