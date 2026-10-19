import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/scripts/editor/e2e/index.html");
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
});

const toolbar = (page) => page.getByRole("toolbar", { name: "Text selection actions" });

async function selectText(page, content, from = 1, to = 5) {
  await page.evaluate(
    ({ content, from, to }) => {
      const editor = window.readyEditors.main;
      editor.commands.setContent(content);
      editor.commands.setTextSelection({ from, to });
      editor.view.focus();
    },
    { content, from, to },
  );
}

test("code selections hide the toolbar, including backward and mixed ranges", async ({ page }) => {
  await selectText(page, "<p>Before</p><pre><code>const answer = 42;</code></pre><p>After</p>");
  await expect(toolbar(page)).toBeVisible();

  for (const range of [
    { from: 9, to: 14 },
    { from: 14, to: 9 },
    { from: 3, to: 14 },
    { from: 14, to: 30 },
    { from: 3, to: 30 },
    { from: 30, to: 3 },
  ]) {
    await page.evaluate(
      (range) => window.readyEditors.main.commands.setTextSelection(range),
      range,
    );
    await expect(toolbar(page)).toBeHidden();
  }

  await page.evaluate(() => window.readyEditors.main.commands.setTextSelection({ from: 1, to: 5 }));
  await expect(toolbar(page)).toBeVisible();
  await toolbar(page).getByRole("button", { name: "Bold", exact: true }).click();
  expect(await page.evaluate(() => window.readyEditors.main.getHTML())).toContain(
    "<strong>Befo</strong>",
  );
});

test("nested code hides the toolbar while ordinary nested text can be formatted", async ({
  page,
}) => {
  for (const content of [
    "<h2>Heading</h2>",
    "<blockquote><p>Quote text</p></blockquote>",
    "<ul><li><p>List text</p></li></ul>",
    "<table><tbody><tr><td><p>Cell text</p></td></tr></tbody></table>",
    "<p><code>inline code</code></p>",
  ]) {
    await page.evaluate((content) => {
      const editor = window.readyEditors.main;
      editor.commands.setContent(content);
      let start;
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && start === undefined) start = pos;
      });
      editor.commands.setTextSelection({ from: start, to: start + 4 });
      editor.view.focus();
    }, content);
    await expect(toolbar(page)).toBeVisible();
  }

  await selectText(page, "<blockquote><pre><code>Nested code</code></pre></blockquote>", 2, 8);
  await expect(toolbar(page)).toBeHidden();
});

test("structural, empty, whitespace and read-only selections hide the toolbar", async ({
  page,
}) => {
  await selectText(page, "<p>Before</p><p>After</p>");
  await expect(toolbar(page)).toBeVisible();
  await page.evaluate(() => window.readyEditors.main.commands.setNodeSelection(0));
  await expect(toolbar(page)).toBeHidden();
  await page.evaluate(() => window.readyEditors.main.commands.selectAll());
  await expect(toolbar(page)).toBeHidden();

  await selectText(page, "<p>Before</p>", 2, 2);
  await expect(toolbar(page)).toBeHidden();
  await selectText(page, "<p>   </p>", 1, 4);
  await expect(toolbar(page)).toBeHidden();

  await selectText(
    page,
    "<table><tbody><tr><td><p>First</p></td><td><p>Second</p></td></tr></tbody></table>",
    4,
    8,
  );
  await expect(toolbar(page)).toBeVisible();
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    const cells = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "tableCell") cells.push(pos);
    });
    editor.commands.setCellSelection({ anchorCell: cells[0], headCell: cells[1] });
  });
  await expect(toolbar(page)).toBeHidden();

  await selectText(page, "<p>Read only</p>");
  await expect(toolbar(page)).toBeVisible();
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.setEditable(false);
    editor.view.dispatch(editor.state.tr.setMeta("editorCapabilities", true));
  });
  await expect(toolbar(page)).toBeHidden();
});

test("reflow does not resurrect an unfocused editor's selection toolbar", async ({ page }) => {
  await selectText(page, "<p>Main text</p>");
  await expect(toolbar(page)).toBeVisible();
  await page.evaluate(() => {
    const main = window.readyEditors.main;
    window.readyEditors.side.view.focus();
    main.commands.setTextSelection({ from: 2, to: 6 });
    main.view.dispatch(main.state.tr.setMeta("selectionBubbleMenu", "updatePosition"));
  });
  await expect(toolbar(page)).toBeHidden();

  await page.evaluate(() => window.readyEditors.main.view.focus());
  await expect(toolbar(page)).toBeVisible();
  await toolbar(page).getByRole("button", { name: "Bold", exact: true }).focus();
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.view.dispatch(editor.state.tr.setMeta("selectionBubbleMenu", "updatePosition"));
  });
  await expect(toolbar(page)).toBeVisible();
});
