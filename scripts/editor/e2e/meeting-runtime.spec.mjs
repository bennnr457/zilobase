import { test, expect } from "@playwright/test";
import { Server } from "@hocuspocus/server";
import * as Y from "yjs";
let server;
let document;
test.beforeAll(async () => {
  document = new Y.Doc();
  const paragraph = new Y.XmlElement("paragraph"),
    text = new Y.XmlText();
  text.insert(0, "Meeting notes");
  paragraph.insert(0, [text]);
  document.getXmlFragment("notes").insert(0, [paragraph]);
  server = new Server({
    port: 1503,
    quiet: true,
    websocketOptions: { handleProtocols: () => "zilobase.collaboration.v1" },
    onAuthenticate: async ({ token }) => {
      if (token !== "ticket") throw new Error("Denied");
    },
    onLoadDocument: async () => document,
  });
  await server.listen();
});
test.afterAll(async () => {
  await server?.destroy();
  document?.destroy();
});
test("embedded meeting opening text has no extra handle and later paragraphs retain theirs", async ({
  page,
}) => {
  await page.route("**/meetings/m/collaboration-ticket", (route) =>
    route.fulfill({
      json: {
        documentName: "meeting:m",
        expiresAt: "2099-01-01T00:00:00Z",
        token: "ticket",
        websocketUrl: "ws://127.0.0.1:1503",
      },
    }),
  );
  await page.goto("/scripts/editor/e2e/meeting-runtime.html?embedded");
  await expect.poll(() => page.evaluate(() => window.meetingSnapshot?.().synced)).toBe(true);
  await page.evaluate(() =>
    window.meetingEditor.commands.setContent("<p>Opening line</p><p>Later line</p>"),
  );
  const first = page.locator(".tiptap-editor > p").first();
  const second = page.locator(".tiptap-editor > p").nth(1);
  const handle = page.getByRole("button", { name: "Open block actions", exact: true });
  await first.hover({ position: { x: 8, y: 10 } });
  await expect(handle).toBeHidden();
  await second.hover({ position: { x: 8, y: 10 } });
  await expect(handle).toBeVisible();
  await first.hover({ position: { x: 8, y: 10 } });
  await expect(handle).toBeHidden();
  await second.hover({ position: { x: 8, y: 10 } });
  await expect(handle).toBeVisible();
  const editorBox = await page.locator(".tiptap-editor").boundingBox();
  const firstBox = await first.boundingBox();
  await page.mouse.move(editorBox.x + 2, firstBox.y + firstBox.height / 2);
  await expect(handle).toBeHidden();
  // A standalone meeting editor has no enclosing block handle to replace it.
  await page.evaluate(() =>
    document.querySelector(".node-meetingBlock").classList.remove("node-meetingBlock"),
  );
  await second.hover({ position: { x: 8, y: 10 } });
  await first.hover({ position: { x: 8, y: 10 } });
  await expect(handle).toBeVisible();
});
test("meeting runtime retains profile edits, persists locally, rehydrates and isolates account changes", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/meetings/m/collaboration-ticket", (route) =>
    route.fulfill({
      json: {
        documentName: "meeting:m",
        expiresAt: "2099-01-01T00:00:00Z",
        token: "ticket",
        websocketUrl: "ws://127.0.0.1:1503",
      },
    }),
  );
  await page.goto("/scripts/editor/e2e/meeting-runtime.html");
  await expect.poll(() => page.evaluate(() => window.meetingSnapshot?.().synced)).toBe(true);
  const guid = await page.evaluate(() => window.meetingSnapshot().guid);
  await page.evaluate(() => window.changeName("Updated profile"));
  await expect.poll(() => page.evaluate(() => window.meetingSnapshot().guid)).toBe(guid);
  const editor = page.locator(".tiptap-editor");
  await expect(editor).toContainText("Meeting notes");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" saved locally");
  await page.evaluate(() => window.flushMeeting());
  await page.evaluate(() => window.mountMeeting(false));
  await expect(editor).toHaveCount(0);
  expect(
    await page.evaluate(async () => {
      const { dropIdlePageDocument } =
        await import("/apps/web/src/sections/pages/editor/collaboration/lib/page-document-cache.ts");
      return dropIdlePageDocument("a", "meeting:m");
    }),
  ).toBe(true);
  await page.evaluate(() => window.mountMeeting(true));
  await expect.poll(() => page.evaluate(() => window.meetingSnapshot().synced)).toBe(true);
  await expect(editor).toContainText("saved locally");
  const restored = await page.evaluate(() => window.meetingSnapshot().guid);
  await page.evaluate(() => window.changeAccount("b"));
  await expect.poll(() => page.evaluate(() => window.meetingSnapshot().guid)).not.toBe(restored);
  await expect.poll(() => page.evaluate(() => window.meetingSnapshot().synced)).toBe(true);
  expect(errors).toEqual([]);
});

test("online meetings retain their storage fallback and refuse a false durable-flush acknowledgement", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(indexedDB, "open", {
      value: () => {
        throw new Error("Storage unavailable for test");
      },
    });
  });
  await page.route("**/meetings/m/collaboration-ticket", (route) =>
    route.fulfill({
      json: {
        documentName: "meeting:m",
        expiresAt: "2099-01-01T00:00:00Z",
        token: "ticket",
        websocketUrl: "ws://127.0.0.1:1503",
      },
    }),
  );
  await page.goto("/scripts/editor/e2e/meeting-runtime.html");
  await expect.poll(() => page.evaluate(() => window.meetingSnapshot?.().synced)).toBe(true);
  await expect(page.locator(".tiptap-editor")).toHaveAttribute("contenteditable", "true");
  const failure = await page.evaluate(async () => {
    try {
      await window.flushMeeting();
      return null;
    } catch (error) {
      return String(error);
    }
  });
  expect(failure).toContain("Storage unavailable for test");
});
