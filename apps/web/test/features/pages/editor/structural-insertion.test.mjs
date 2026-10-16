export function register({ assert, loadModule, test }) {
  test("structural insertion stays pending until the created block is inserted", async () => {
    const { runStructuralInsertion } = await loadModule(
      "/src/components/pages/editor/commands/structural-insertion.ts",
    );
    const events = [];

    const created = await runStructuralInsertion({
      create: async () => {
        events.push("created");
        return "database-1";
      },
      insert: (databaseId) => events.push(`inserted:${databaseId}`),
      onPendingChange: (pending) => events.push(`pending:${pending}`),
    });

    assert.equal(created, "database-1");
    assert.deepEqual(events, ["pending:true", "created", "inserted:database-1", "pending:false"]);
  });

  test("failed structural creation always releases the recovery guard", async () => {
    const { runStructuralInsertion } = await loadModule(
      "/src/components/pages/editor/commands/structural-insertion.ts",
    );
    const pendingChanges = [];

    await assert.rejects(
      runStructuralInsertion({
        create: async () => {
          throw new Error("create failed");
        },
        insert: () => assert.fail("failed creations must not insert"),
        onPendingChange: (pending) => pendingChanges.push(pending),
      }),
      /create failed/,
    );
    assert.deepEqual(pendingChanges, [true, false]);
  });
  test("structural creation and pending flags start before returning the Promise", async () => {
    const { runStructuralInsertion } = await loadModule(
      "/src/components/pages/editor/commands/structural-insertion.ts",
    );
    const events = [];
    let finish;
    const operation = runStructuralInsertion({
      create: () => {
        events.push("create");
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      insert: () => events.push("insert"),
      onPendingChange: (pending) => events.push(pending),
    });
    assert.deepEqual(events, [true, "create"]);
    finish("created");
    await operation;
    assert.deepEqual(events, [true, "create", "insert", false]);
  });

  test("structural workflows preserve exact sync, async and insertion errors", async () => {
    const { runStructuralInsertion } = await loadModule(
      "/src/components/pages/editor/commands/structural-insertion.ts",
    );
    for (const step of ["sync-create", "async-create", "insert"]) {
      const failure = new Error(step);
      const pending = [];
      const operation = runStructuralInsertion({
        create: () => {
          if (step === "sync-create") throw failure;
          return step === "async-create" ? Promise.reject(failure) : Promise.resolve("created");
        },
        insert: () => {
          throw failure;
        },
        onPendingChange: (value) => pending.push(value),
      });
      await assert.rejects(operation, (error) => error === failure);
      assert.deepEqual(pending, [true, false]);
    }
  });

  test("missing or cancelled creation and a failing pending callback preserve cleanup boundaries", async () => {
    const { runStructuralInsertion } = await loadModule(
      "/src/components/pages/editor/commands/structural-insertion.ts",
    );
    const pending = [];
    const input = {
      insert: () => assert.fail("must not insert"),
      onPendingChange: (value) => pending.push(value),
    };
    assert.equal(await runStructuralInsertion(input), null);
    assert.deepEqual(pending, []);
    assert.equal(await runStructuralInsertion({ ...input, create: async () => null }), null);
    assert.deepEqual(pending, [true, false]);
    const failure = new Error("pending callback");
    pending.length = 0;
    await assert.rejects(
      runStructuralInsertion({
        ...input,
        create: () => assert.fail("must not create"),
        onPendingChange: (value) => {
          pending.push(value);
          throw failure;
        },
      }),
      (error) => error === failure,
    );
    assert.deepEqual(pending, [true]);
  });

  test("created-block anchors release after failures and late editor destruction", async () => {
    const { insertCreatedBlock } = await loadModule(
      "/src/components/pages/editor/commands/structural-insertion.ts",
    );
    const { Schema } = await import("@tiptap/pm/model");
    const schema = new Schema({
      nodes: { doc: { content: "paragraph+" }, text: {}, paragraph: { content: "text*" } },
    });
    for (const stage of ["create", "content", "destroyed"]) {
      const listeners = new Set();
      const failure = new Error(stage);
      const editor = {
        isDestroyed: false,
        isEditable: true,
        state: {
          doc: schema.node("doc", null, [schema.node("paragraph", null, schema.text("draft"))]),
        },
        utils: { createMappablePosition: (position) => ({ position }) },
        on: (_, listener) => listeners.add(listener),
        off: (_, listener) => listeners.delete(listener),
        chain() {
          return {
            focus() {
              return this;
            },
            replaceBlocksRange() {
              return this;
            },
            run() {},
          };
        },
      };
      let complete;
      const pending = [];
      const operation = insertCreatedBlock({
        editor,
        range: { from: 0, to: 7 },
        create: () =>
          new Promise((resolve, reject) => {
            complete = stage === "create" ? () => reject(failure) : () => resolve("created");
          }),
        content: () => {
          throw failure;
        },
        onPendingChange: (value) => pending.push(value),
      });
      assert.equal(listeners.size, 2);
      if (stage === "destroyed") editor.isDestroyed = true;
      complete();
      if (stage === "destroyed") assert.equal(await operation, "created");
      else await assert.rejects(operation, (error) => error === failure);
      assert.equal(listeners.size, 0);
      assert.deepEqual(pending, [true, false]);
    }
  });
  test("structural pending cleanup errors retain finally precedence over creation errors", async () => {
    const { runStructuralInsertion } = await loadModule(
      "/src/components/pages/editor/commands/structural-insertion.ts",
    );
    const body = new Error("creation"),
      cleanup = new Error("cleanup");
    await assert.rejects(
      runStructuralInsertion({
        create: () => Promise.reject(body),
        insert() {},
        onPendingChange: (pending) => {
          if (!pending) throw cleanup;
        },
      }),
      (error) => error === cleanup,
    );
  });
}
