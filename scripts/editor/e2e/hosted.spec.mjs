import { test, expect } from "@playwright/test";
import { Server } from "@hocuspocus/server";
import * as Y from "yjs";

let server;
let document;
const session = {
  user: { id: "a", name: "Native", email: "a@example.com", emailVerified: true, hasPassword: true },
  session: { id: "s", userId: "a", activeWorkspaceId: "w", expiresAt: "2099-01-01T00:00:00Z" },
};
const pageData = {
  id: "p",
  workspaceId: "w",
  name: "Original",
  type: "doc",
  metadata: {},
  createdById: "a",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  content: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Hosted text" }] }],
  },
};
test.beforeAll(async () => {
  document = new Y.Doc();
  server = new Server({
    port: 1503,
    websocketOptions: { handleProtocols: () => "zilobase.collaboration.v1" },
    quiet: true,
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
async function load(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (
      ![
        /^\/session$/,
        /^\/pages(?:\/|$)/,
        /^\/user-settings/,
        /^\/meetings/,
        /^\/page-layout/,
        /^\/api\/auth\/workspace/,
      ].some((pattern) => pattern.test(path))
    )
      return route.continue();
    const auth = route.request().headers().authorization;
    if (auth !== "Bearer native-secret")
      return route.fulfill({ status: 401, json: { error: "Denied" } });
    let json = {};
    if (path === "/session") json = session;
    else if (path.includes("collaboration-bootstrap"))
      json = {
        documentName: "page:p",
        expiresAt: "2099-01-01T00:00:00Z",
        token: "ticket",
        websocketUrl: "ws://127.0.0.1:1503",
        initialState: Buffer.from(
          Y.encodeStateAsUpdate(server.hocuspocus.documents.get("page:p") ?? document),
        ).toString("base64"),
      };
    else if (path === "/pages/p")
      json = { page: pageData, databaseIds: [], accessLevel: "full", viewerType: "member" };
    else if (path === "/pages") json = { pages: [pageData], databases: [], placements: [] };
    else if (path.endsWith("/access"))
      json = { access: [{ id: "access", pageId: "p", userId: "a", accessLevel: "full" }] };
    else if (path.endsWith("/databases")) json = { databaseIds: [] };
    else if (path.endsWith("/properties")) json = { workspaceId: "w", properties: [], values: [] };
    else if (path.startsWith("/meetings")) json = { meetings: [] };
    else if (path === "/user-settings") json = { settings: {} };
    else if (path.startsWith("/page-layout")) json = { config: {}, sources: {} };
    else if (path.startsWith("/api/auth/workspace"))
      json = [{ id: "w", name: "Workspace", slug: "workspace", role: "owner" }];
    return route.fulfill({ json });
  });
  await page.goto("/scripts/editor/e2e/hosted.html");
  await page.waitForFunction(() => window.hostedReady?.());
}
const send = (page, command, patch) =>
  page.evaluate(({ command, patch }) => window.sendHosted(command, patch), { command, patch });
test("native host and hosted editor authenticate, flush, reconnect and dispose independently", async ({
  page,
  context,
}) => {
  await load(page);
  expect(await page.evaluate(() => window.readNativePage())).toBe("Original");
  expect((await send(page, { type: "initialize", sessionToken: "native-secret" })).result.ok).toBe(
    true,
  );
  const opened = await send(page, { type: "openPage", pageId: "p" });
  expect(opened.result.ok).toBe(true);
  const editor = page.frameLocator("iframe").locator(".tiptap-editor[contenteditable]").first();
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute("contenteditable", "true", { timeout: 15_000 });
  await expect
    .poll(async () => (await send(page, { type: "status" })).result.status.state, {
      timeout: 15_000,
    })
    .toBe("synchronized");
  await page.evaluate(async () => {
    await window.readNativePage();
    window.messages.length = 0;
  });
  await send(page, { type: "focus" });
  await editor.fill("Changed in WebView");
  const flushed = await send(page, { type: "flushLocal" });
  expect(flushed.result.ok).toBe(true);
  expect(flushed.result.locallyFlushed).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.messages.some(
          (message) => message.type === "event" && message.event.type === "changed",
        ),
      ),
    )
    .toBe(true);
  await expect.poll(() => page.evaluate(() => window.nativeInvalidated())).toBe(true);
  await context.setOffline(true);
  expect((await send(page, { type: "status" })).result.status.state).toBe("offline");
  await context.setOffline(false);
  await expect
    .poll(async () => (await send(page, { type: "status" })).result.status.state, {
      timeout: 15_000,
    })
    .toBe("synchronized");
  expect((await send(page, { type: "close" })).result.status.state).toBe("closed");
  expect(await page.evaluate(() => window.nativeStillPresent())).toBe(true);
  await expect(editor).toHaveCount(0);
  const leaked = await page
    .frameLocator("iframe")
    .locator("body")
    .evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
        cookie: document.cookie,
      }),
    );
  expect(leaked).not.toContain("native-secret");
  expect(
    await page
      .frameLocator("iframe")
      .locator("body")
      .evaluate(async () => {
        const { getHostedEditorAuthToken } =
          await import("/apps/web/src/platform/auth/hosted-editor-auth.ts");
        return getHostedEditorAuthToken();
      }),
  ).toBeNull();
});
test("wrong credentials and stale host identities cannot retain an editor", async ({ page }) => {
  await load(page);
  expect((await send(page, { type: "initialize", sessionToken: "wrong" })).result.ok).toBe(false);
  expect((await send(page, { type: "initialize", sessionToken: "native-secret" })).result.ok).toBe(
    true,
  );
  expect((await send(page, { type: "status" }, { instanceId: "old-editor" })).result.code).toBe(
    "identity_mismatch",
  );
  expect((await send(page, { type: "focus" })).result.code).toBe("not_initialized");
});

test("hosted startup requires connectivity and rejects another deployment", async ({
  page,
  context,
}) => {
  await load(page);
  await context.setOffline(true);
  expect((await send(page, { type: "initialize", sessionToken: "native-secret" })).result.ok).toBe(
    false,
  );
  await context.setOffline(false);
  const scope = { deployment: "other-server", accountId: "a", sessionId: "s", workspaceId: "w" };
  expect(
    (await send(page, { type: "initialize", sessionToken: "native-secret" }, { scope })).result.ok,
  ).toBe(false);
  expect((await send(page, { type: "status" })).result.code).toBe("not_initialized");
});
