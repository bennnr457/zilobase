import { parseHTML } from "linkedom";

export function register({ assert, loadModule, test }) {
  async function withShortcuts(run) {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML(
      "<html><body><div id='root'></div><input /></body></html>",
    );
    Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement });
    const listeners = new Set();
    const removed = [];
    // Initialize linkedom's lazy window event target before replacing its ports.
    void window.addEventListener;
    window.addEventListener = (type, listener, capture) => {
      assert.equal(type, "keydown");
      assert.equal(capture, true);
      listeners.add(listener);
    };
    window.removeEventListener = (type, listener, capture) => {
      assert.equal(type, "keydown");
      assert.equal(capture, true);
      removed.push(listener);
      listeners.delete(listener);
    };
    let runtime;
    try {
      const { mountShortcuts } = await loadModule(
        "/apps/web/test/support/fixtures/shortcut-runtime.tsx",
      );
      runtime = mountShortcuts(document.getElementById("root"));
      const key = (overrides = {}) => {
        const event = {
          key: "z",
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          target: document.body,
          defaultPrevented: false,
          stopped: false,
          preventDefault() {
            this.defaultPrevented = true;
          },
          stopImmediatePropagation() {
            this.stopped = true;
          },
          ...overrides,
        };
        assert.equal(listeners.size, 1);
        [...listeners][0](event);
        return event;
      };
      await run(runtime, key, document);
    } finally {
      runtime?.unmount();
      assert.equal(listeners.size, 0, "capture listener is released on unmount");
      assert.ok(removed.length >= 2, "StrictMode setup/cleanup is exercised");
      await new Promise((resolve) => setTimeout(resolve, 0));
      for (const name of Object.getOwnPropertyNames(globalThis))
        if (!saved[name]) delete globalThis[name];
      Object.defineProperties(globalThis, saved);
    }
  }

  test("shortcut dispatch keeps synchronous priority, fallthrough, latest handlers and editable policy", () =>
    withShortcuts(async (runtime, key, document) => {
      const calls = [];
      const binding = (id, priority, handled) => ({
        id,
        priority,
        shortcutId: "undo",
        handler(event) {
          assert.equal(event.defaultPrevented, false);
          calls.push(id);
          return handled;
        },
      });
      const bindings = [
        binding("low", 0, true),
        binding("older", 10, true),
        binding("newer", 10, false),
      ];
      runtime.render(bindings);
      assert.equal(key().stopped, true);
      assert.deepEqual(calls.splice(0), ["newer", "older"]);
      runtime.render([
        bindings[0],
        {
          ...bindings[1],
          handler: () => {
            calls.push("updated");
            return true;
          },
        },
        bindings[2],
      ]);
      assert.equal(key().defaultPrevented, true);
      assert.deepEqual(calls.splice(0), ["newer", "updated"]);
      assert.equal(key({ target: document.querySelector("input") }).defaultPrevented, false);
      assert.equal(key({ defaultPrevented: true }).stopped, false);
      assert.deepEqual(calls, []);
      runtime.render([{ ...bindings[0], allowInEditable: true }]);
      assert.equal(key({ target: document.querySelector("input") }).stopped, true);
      assert.deepEqual(calls.splice(0), ["low"]);
      runtime.render([]);
      assert.equal(key().defaultPrevented, false);
    }));

  test("shortcut failures remain synchronous and preserve the exact error without consuming the key", () =>
    withShortcuts(async (runtime, key) => {
      const error = new Error("shortcut failed");
      let prevented = false;
      runtime.render([
        {
          id: "throw",
          shortcutId: "undo",
          handler: () => {
            throw error;
          },
        },
      ]);
      assert.throws(
        () =>
          key({
            preventDefault() {
              prevented = true;
            },
          }),
        (caught) => caught === error,
      );
      assert.equal(prevented, false);
    }));

  test("scoped history preserves suppression, failures, skipped actions, redo and scope reset", () =>
    withShortcuts(async (runtime, key, document) => {
      const scopes = [
        { id: "first", resetKey: 1 },
        { id: "second", resetKey: 1 },
      ];
      runtime.render([], scopes);
      const first = runtime.histories.get("first");
      const second = runtime.histories.get("second");
      const calls = [];
      const action = (label) => ({
        label,
        undo: () => {
          calls.push(`undo:${label}`);
        },
        redo: () => {
          calls.push(`redo:${label}`);
        },
      });
      const error = new Error("undo failed");
      assert.throws(
        () =>
          first.runWithoutRecording(() => {
            assert.equal(first.shouldRecord(), false);
            first.runWithoutRecording(() => first.pushAction(action("suppressed")));
            assert.equal(first.shouldRecord(), false);
            throw error;
          }),
        (caught) => caught === error,
      );
      assert.equal(first.shouldRecord(), true);
      const promise = Promise.resolve("value");
      assert.equal(
        first.runWithoutRecording(() => promise),
        promise,
      );
      assert.equal(
        first.shouldRecord(),
        true,
        "suppression ends synchronously even for Promise values",
      );
      first.pushAction(action("first"));
      second.pushAction(action("second"));
      assert.equal(key({ target: document.querySelector("input") }).defaultPrevented, false);
      assert.equal(key().defaultPrevented, true);
      assert.deepEqual(calls.splice(0), ["undo:second"]);
      assert.equal(
        key().defaultPrevented,
        false,
        "inactive scopes do not consume another scope's undo",
      );
      assert.equal(key({ shiftKey: true }).defaultPrevented, true);
      assert.deepEqual(calls.splice(0), ["redo:second"]);
      second.pushAction({ label: "skip", undo: () => false, redo: () => false });
      key();
      assert.deepEqual(calls.splice(0), ["undo:second"]);
      second.pushAction(action("replacement"));
      assert.equal(key({ shiftKey: true }).defaultPrevented, false);
      second.pushAction({
        label: "throw",
        undo: () => {
          assert.equal(second.shouldRecord(), false);
          throw error;
        },
        redo: () => {},
      });
      assert.throws(
        () => key(),
        (caught) => caught === error,
      );
      assert.equal(second.shouldRecord(), true);
      key();
      assert.deepEqual(calls.splice(0), ["undo:replacement"]);
      runtime.render([], [{ ...scopes[0] }, { id: "second", resetKey: 2 }]);
      assert.equal(key({ shiftKey: true }).defaultPrevented, false);
      document
        .querySelector('[data-scope="first"]')
        .dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
      assert.equal(key().defaultPrevented, true);
      assert.deepEqual(calls.splice(0), ["undo:first"]);
      assert.equal(key().defaultPrevented, false, "nested suppressed actions were not recorded");
      second.pushAction(action("activate-second"));
      runtime.render([], [scopes[0]]);
      assert.equal(key().defaultPrevented, false, "unmount releases active scope ownership");
    }));

  test("scoped history bounds retained actions and releases suppression after redo fails", () =>
    withShortcuts(async (runtime, key) => {
      runtime.render([], [{ id: "history", resetKey: 1 }]);
      const history = runtime.histories.get("history");
      const undone = [];
      for (let index = 0; index < 101; index++) {
        history.pushAction({
          label: String(index),
          undo: () => {
            undone.push(index);
          },
          redo: () => {},
        });
      }
      for (let index = 0; index < 100; index++) assert.equal(key().defaultPrevented, true);
      assert.equal(key().defaultPrevented, false);
      assert.deepEqual(
        undone,
        Array.from({ length: 100 }, (_, index) => 100 - index),
      );
      const error = new Error("redo failed");
      history.pushAction({
        label: "throw",
        undo: () => {},
        redo: () => {
          assert.equal(history.shouldRecord(), false);
          throw error;
        },
      });
      key();
      assert.throws(
        () => key({ shiftKey: true }),
        (caught) => caught === error,
      );
      assert.equal(history.shouldRecord(), true);
      assert.equal(key({ shiftKey: true }).defaultPrevented, false);
    }));
}
