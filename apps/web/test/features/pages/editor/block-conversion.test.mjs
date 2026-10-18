export function register({ assert, loadModule, test }) {
  test("conversion preserves whitespace and formatting and strips only code-incompatible marks", async () => {
    const { blockContentForConversion: convert } = await loadModule(
      "/src/sections/pages/editor/commands/lib/block-insert.ts",
    );
    const { Schema } = await import("@tiptap/pm/model");
    const schema = new Schema({
      nodes: {
        doc: { content: "block+" },
        text: { group: "inline" },
        paragraph: { group: "block", content: "inline*" },
        heading: { group: "block", content: "inline*", attrs: { level: { default: 1 } } },
        codeBlock: { group: "block", content: "text*", marks: "", code: true },
        hardBreak: { group: "inline", inline: true },
        blockquote: { group: "block", content: "block+" },
        tabsBlock: { group: "block", content: "tabPanel+" },
        tabPanel: { content: "block+", attrs: { title: { default: "Tab" } } },
        callout: { group: "block", content: "block+", attrs: { icon: { default: "💡" } } },
        bulletList: { group: "block", content: "listItem+" },
        listItem: { content: "paragraph block*" },
        orderedList: { group: "block", content: "listItem+" },
        taskList: { group: "block", content: "taskItem+" },
        taskItem: { content: "paragraph block*", attrs: { checked: { default: false } } },
        details: { group: "block", content: "detailsSummary detailsContent" },
        detailsSummary: { content: "inline*" },
        detailsContent: { content: "block+" },
        databaseBlock: { group: "block", atom: true },
      },
      marks: { bold: {}, link: { attrs: { href: {} } } },
    });
    const paragraph = schema.node("paragraph", null, [
      schema.text(" Keep ", [schema.mark("bold")]),
      schema.node("hardBreak"),
      schema.text("spaces "),
    ]);
    for (const id of [
      "paragraph",
      "heading1",
      "heading2",
      "heading3",
      "blockquote",
      "callout",
      "tabsBlock",
      "bulletList",
      "orderedList",
      "taskList",
      "details",
    ]) {
      const result = convert(id, [paragraph], schema);
      assert.ok(result, id);
      assert.equal(result.map((n) => n.textContent).join(""), " Keep spaces ");
      let bold = false;
      result.forEach((n) =>
        n.descendants((child) => {
          bold ||= child.marks.some((m) => m.type.name === "bold");
        }),
      );
      assert.equal(bold, true, id);
      result.forEach((n) => n.check());
      for (const destination of [
        "paragraph",
        "heading1",
        "heading2",
        "heading3",
        "blockquote",
        "callout",
        "tabsBlock",
        "bulletList",
        "orderedList",
        "taskList",
        "details",
      ]) {
        const converted = convert(destination, result, schema);
        assert.ok(converted, `${id} to ${destination}`);
        converted.forEach((node) => node.check());
        assert.equal(
          converted.map((node) => node.textContent).join(""),
          " Keep spaces ",
          `${id} to ${destination}`,
        );
      }
    }
    assert.equal(
      convert(
        "codeBlock",
        [paragraph, schema.node("paragraph", null, schema.text("  "))],
        schema,
      )[0].textContent,
      " Keep \nspaces \n  ",
    );
    assert.equal(convert("codeBlock", [schema.node("databaseBlock")], schema), null);
    assert.equal(convert("imageBlock", [paragraph], schema), null);
    const blocks = [
      schema.node("heading", { level: 2 }, schema.text("Title")),
      schema.node("databaseBlock"),
    ];
    const wrapped = convert("callout", blocks, schema);
    wrapped[0].check();
    assert.deepEqual(
      wrapped[0].content.toJSON(),
      blocks.map((block) => block.toJSON()),
    );
    assert.equal(wrapped[0].attrs.icon, "💡");
  });

  async function plusFixture({ text = "draft", insertError, cleanupError } = {}) {
    const { insertBlockFromPlus } = await loadModule(
      "/src/sections/pages/editor/commands/lib/block-insert.ts",
    );
    const { Schema } = await import("@tiptap/pm/model");
    const schema = new Schema({
      nodes: { doc: { content: "paragraph+" }, text: {}, paragraph: { content: "text*" } },
    });
    const paragraph = (value) => schema.node("paragraph", null, value ? schema.text(value) : null);
    const node = paragraph(text);
    const events = [],
      listeners = new Set();
    const chain = {
      focus() {
        events.push("focus");
        return this;
      },
      replaceBlocksRange(range, content) {
        events.push(["replace", range, content]);
        if (insertError) throw insertError;
        return this;
      },
      insertBlocksAt(pos, content) {
        events.push(["insert", pos, content]);
        if (insertError) throw insertError;
        return this;
      },
      setTextSelection(pos) {
        events.push(["selection", pos]);
        return this;
      },
      run() {
        return true;
      },
    };
    const editor = {
      isDestroyed: false,
      isEditable: true,
      state: { doc: schema.node("doc", null, [node]) },
      utils: {
        createMappablePosition: (position) => ({ position }),
        getUpdatedPosition: (position, transaction) => ({
          position: { position: position.position + (transaction.shift ?? 0) },
          mapResult: { deleted: transaction.deleted ?? false },
        }),
      },
      on: (_, listener) => listeners.add(listener),
      off: (_, listener) => {
        listeners.delete(listener);
        events.push("release");
        if (cleanupError) throw cleanupError;
      },
      chain: () => chain,
    };
    return {
      editor,
      node,
      events,
      listeners,
      paragraph,
      schema,
      insert: (title, options) =>
        insertBlockFromPlus(
          editor,
          { node, pos: 0 },
          {
            id: { Text: "paragraph", Database: "databaseBlock", "Meeting notes": "meetingBlock" }[
              title
            ],
            title,
          },
          options,
        ),
      transaction: (transaction) => {
        for (const listener of listeners) listener({ transaction });
      },
    };
  }

  test("plus insertion replaces empty blocks, appends after content and releases anchors immediately", async () => {
    for (const text of ["", "draft"]) {
      const f = await plusFixture({ text });
      const operation = f.insert("Text");
      assert.equal(f.listeners.size, 0);
      assert.deepEqual(f.events, [
        "focus",
        text
          ? ["insert", f.node.nodeSize, { type: "paragraph" }]
          : ["replace", { from: 0, to: f.node.nodeSize }, { type: "paragraph" }],
        "focus",
        ["selection", text ? f.node.nodeSize + 1 : 1],
        "release",
      ]);
      assert.equal(await operation, undefined);
    }
  });

  test("plus resource insertion starts eagerly, waits for creation and clears pending before releasing its anchor", async () => {
    for (const title of ["Database", "Meeting notes"]) {
      const f = await plusFixture();
      let complete;
      const create = () => {
        f.events.push("create");
        return new Promise((resolve) => {
          complete = resolve;
        });
      };
      const operation = f.insert(title, {
        onCreateDatabase: create,
        onCreateMeeting: create,
        onStructuralInsertionPendingChange: (pending) => f.events.push(pending),
      });
      assert.deepEqual(f.events, [true, "create"]);
      assert.equal(f.listeners.size, 1);
      complete("resource");
      assert.equal(await operation, undefined);
      const content = f.events.find((event) => Array.isArray(event) && event[0] === "insert")[2];
      assert.equal(
        title === "Database" ? content[0].attrs.databaseId : content.attrs.meetingId,
        "resource",
      );
      assert.deepEqual(f.events.slice(-2), [false, "release"]);
      assert.equal(f.listeners.size, 0);
    }
  });

  test("plus insertion preserves adapter errors and cleanup precedence", async () => {
    for (const stage of ["sync-create", "async-create", "insert", "pending", "cleanup"]) {
      const failure = new Error(stage),
        cleanup = new Error("anchor cleanup");
      const f = await plusFixture({
        insertError: stage === "insert" ? failure : undefined,
        cleanupError: stage === "cleanup" ? cleanup : undefined,
      });
      const operation = f.insert("Database", {
        onCreateDatabase: () => {
          if (stage === "sync-create") throw failure;
          return ["async-create", "cleanup"].includes(stage)
            ? Promise.reject(failure)
            : Promise.resolve("resource");
        },
        onStructuralInsertionPendingChange: (pending) => {
          f.events.push(pending);
          if (stage === "pending") throw failure;
        },
      });
      await assert.rejects(
        operation,
        (error) => error === (stage === "cleanup" ? cleanup : failure),
      );
      assert.deepEqual(
        f.events.filter((event) => typeof event === "boolean"),
        stage === "pending" ? [true] : [true, false],
      );
      assert.equal(f.events.at(-1), "release");
      assert.equal(f.listeners.size, 0);
    }
  });

  test("plus insertion skips late writes to destroyed, read-only, replaced or deleted blocks", async () => {
    for (const stage of ["destroyed", "readonly", "replaced", "deleted"]) {
      const f = await plusFixture();
      let complete;
      const operation = f.insert("Database", {
        onCreateDatabase: () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      });
      if (stage === "destroyed") f.editor.isDestroyed = true;
      if (stage === "readonly") f.editor.isEditable = false;
      if (stage === "replaced")
        f.editor.state.doc = f.schema.node("doc", null, [f.paragraph("replacement")]);
      if (stage === "deleted") f.transaction({ deleted: true });
      complete("resource");
      await operation;
      assert.deepEqual(f.events, ["release"]);
      assert.equal(f.listeners.size, 0);
    }
  });

  test("plus insertion follows its source block when preceding content changes", async () => {
    const f = await plusFixture();
    let complete;
    const operation = f.insert("Meeting notes", {
      onCreateMeeting: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    });
    const prefix = f.paragraph("earlier edit");
    f.editor.state.doc = f.schema.node("doc", null, [prefix, f.node]);
    f.transaction({ shift: prefix.nodeSize });
    complete("meeting");
    await operation;
    assert.deepEqual(
      f.events.find((event) => Array.isArray(event) && event[0] === "insert"),
      [
        "insert",
        prefix.nodeSize + f.node.nodeSize,
        { type: "meetingBlock", attrs: { meetingId: "meeting" } },
      ],
    );
    assert.equal(f.listeners.size, 0);
  });

  test("plus resource anchor cleanup stays asynchronous for absent callbacks and synchronous failures", async () => {
    for (const stage of ["missing", "create", "pending"]) {
      const f = await plusFixture();
      const failure = new Error(stage);
      const operation = f.insert("Database", {
        onCreateDatabase:
          stage === "missing"
            ? undefined
            : () => {
                throw failure;
              },
        onStructuralInsertionPendingChange: (pending) => {
          if (stage === "pending") throw failure;
        },
      });
      const completion =
        stage === "missing" ? operation : assert.rejects(operation, (error) => error === failure);
      assert.equal(f.listeners.size, 1, stage);
      await completion;
      assert.equal(f.listeners.size, 0, stage);
    }
  });
}
