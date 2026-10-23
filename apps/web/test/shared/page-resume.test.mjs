export function register({ assert, loadModule, test }) {
  test("page resume listens to foreground browser events and removes all listeners on disposal", async () => {
    const { subscribePageResume } = await loadModule("/src/platform/network/connectivity.ts");
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const browser = new EventTarget();
    const page = new EventTarget();
    page.visibilityState = "hidden";
    Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
    Object.defineProperty(globalThis, "document", { configurable: true, value: page });
    let calls = 0;
    const unsubscribe = subscribePageResume(() => calls++);
    try {
      browser.dispatchEvent(new Event("focus"));
      page.dispatchEvent(new Event("visibilitychange"));
      assert.equal(calls, 0);
      page.visibilityState = "visible";
      page.dispatchEvent(new Event("visibilitychange"));
      browser.dispatchEvent(new Event("focus"));
      browser.dispatchEvent(new Event("pageshow"));
      assert.equal(calls, 3);
      unsubscribe();
      browser.dispatchEvent(new Event("focus"));
      browser.dispatchEvent(new Event("pageshow"));
      page.dispatchEvent(new Event("visibilitychange"));
      assert.equal(calls, 3);
    } finally {
      unsubscribe();
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else delete globalThis.window;
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
      else delete globalThis.document;
    }
  });
}
