import { test, expect } from "@playwright/test";

const paragraph = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
const containers = {
  callout: (content) => ({ type: "callout", content }),
  tabsBlock: (content) => ({
    type: "tabsBlock",
    content: [{ type: "tabPanel", attrs: { title: "Overview" }, content }],
  }),
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api.zilobase.test/**", (route) => route.fulfill({ json: {} }));
  await page.goto("/scripts/editor/e2e/index.html");
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
});

for (const [type, wrap] of Object.entries(containers)) {
  for (const line of [0, 1]) {
    test(`${type} opening line uses the container handle, later lines drag separately (${line})`, async ({
      page,
    }) => {
      await page.evaluate(
        (node) => window.readyEditors.main.commands.setContent({ type: "doc", content: [node] }),
        wrap([paragraph("Opening line"), paragraph("Later line")]),
      );
      const main = page.getByTestId("main-pane");
      const side = page.getByTestId("side-pane");
      const text = main.getByText(line ? "Later line" : "Opening line", { exact: true });
      // Touch actions and the official desktop drag must agree on their target.
      expect(
        await text.evaluate(async (dom) => {
          const { resolveBlockDragTargetFromPoint } =
            await import("/apps/web/src/sections/pages/editor/drag-drop/lib/block-drag-geometry.ts");
          const rect = dom.getBoundingClientRect();
          return resolveBlockDragTargetFromPoint({
            view: window.readyEditors.main.view,
            clientX: rect.left + 8,
            clientY: rect.top + 10,
          })?.node.type.name;
        }),
      ).toBe(line ? "paragraph" : type);
      // Return from the later line to the opening line to catch stale targets.
      await main.getByText("Later line", { exact: true }).hover({ position: { x: 8, y: 10 } });
      await text.hover({ position: { x: 8, y: 10 } });
      const handle = main.getByRole("button", { name: "Open block actions", exact: true });
      await expect(handle).toBeVisible();
      await handle.dragTo(side.locator(".tiptap-editor p").first());
      await expect(side.locator(".tiptap-editor")).toContainText(
        line ? "Later line" : "Opening line",
      );
      const documents = await page.evaluate(() => ({
        main: window.readyEditors.main.getJSON(),
        side: window.readyEditors.side.getJSON(),
      }));
      if (line) {
        expect(documents.main.content[0].type).toBe(type);
        expect(JSON.stringify(documents.main)).toContain("Opening line");
        expect(JSON.stringify(documents.main)).not.toContain("Later line");
        expect(documents.side.content.some((node) => node.type === type)).toBe(false);
      } else {
        expect(documents.side.content.some((node) => node.type === type)).toBe(true);
        expect(JSON.stringify(documents.side)).toContain("Later line");
        expect(documents.main.content.some((node) => node.type === type)).toBe(false);
      }
    });
  }
}

test("opening headings, empty paragraphs and nested containers retain container ownership", async ({
  page,
}) => {
  const cases = [
    containers.callout([
      { type: "heading", attrs: { level: 2 }, content: paragraph("Heading").content },
    ]),
    containers.tabsBlock([{ type: "paragraph" }]),
    containers.tabsBlock([containers.callout([paragraph("Nested opening")])]),
  ];
  for (const node of cases) {
    await page.evaluate(
      (node) => window.readyEditors.main.commands.setContent({ type: "doc", content: [node] }),
      node,
    );
    const nested = page
      .getByTestId("main-pane")
      .locator(".editor-callout-content p, .editor-tab-panel > p, .editor-callout-content h2")
      .first();
    await nested.hover({ position: { x: 8, y: 10 } });
    await page
      .getByTestId("main-pane")
      .getByRole("button", { name: "Open block actions", exact: true })
      .click();
    const expectedType =
      node.content[0].type === "tabPanel" && node.content[0].content[0].type !== "callout"
        ? "tabsBlock"
        : "callout";
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const { blockMenuSelectionPluginKey } =
            await import("/apps/web/src/sections/pages/editor/extensions/lib/block-selection.ts");
          const editor = window.readyEditors.main;
          const decoration = blockMenuSelectionPluginKey.getState(editor.state)?.find()[0];
          return decoration ? editor.state.doc.nodeAt(decoration.from)?.type.name : null;
        }),
      )
      .toBe(expectedType);
    await page.keyboard.press("Escape");
  }
});
