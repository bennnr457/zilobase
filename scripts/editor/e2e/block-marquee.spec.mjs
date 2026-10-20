import { test, expect } from "@playwright/test";

const editorSelector = '[data-testid="main-pane"] .tiptap-editor';

async function setContent(page, content) {
  await page.evaluate(
    (content) =>
      window.readyEditors.main.chain().setContent(content).setMeta("addToHistory", false).run(),
    content,
  );
}

async function geometry(page, selector = "p", index = 0) {
  const editor = page.locator(editorSelector);
  const rect = await editor.boundingBox();
  const block = await editor.locator(selector).nth(index).boundingBox();
  return { rect, block, gutter: rect.x - 40 };
}

async function begin(page, start, end) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await expect(page.locator(".editor-block-marquee")).toBeVisible();
}

async function dragRows(page, { reverse = false, side = false } = {}) {
  const { rect, block, gutter } = await geometry(page);
  const last = await page.locator(editorSelector).locator("p").last().boundingBox();
  const outside = side ? rect.x + rect.width + 40 : gutter;
  const start = { x: outside, y: reverse ? last.y + last.height - 2 : block.y + 2 };
  const end = { x: rect.x + rect.width / 2, y: reverse ? block.y + 2 : last.y + last.height - 2 };
  await begin(page, start, end);
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api.zilobase.test/**", (route) => route.fulfill({ json: {} }));
  await page.goto("/scripts/editor/e2e/index.html");
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
});

for (const reverse of [false, true]) {
  for (const side of [false, true]) {
    test(`whitespace marquee selects whole blocks ${reverse ? "up" : "down"} from the ${side ? "right" : "left"}`, async ({
      page,
    }) => {
      await dragRows(page, { reverse, side });
      const marquee = page.locator(".editor-block-marquee");
      await expect(marquee).toHaveCSS("border-top-width", "0px");
      const alpha = await marquee.evaluate((node) =>
        Number(getComputedStyle(node).backgroundColor.match(/(?:,|\/)\s*([\d.]+)\s*\)$/)?.[1] ?? 1),
      );
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(0.2);
      await expect(page.locator(`${editorSelector} .editor-block-selection`)).toHaveCount(2);
      await expect(page.getByTestId("side-pane").locator(".editor-block-selection")).toHaveCount(0);
      await page.mouse.up();
      await expect(page.locator(".editor-block-marquee")).toHaveCount(0);
      expect(await page.evaluate(() => window.readyEditors.main.state.selection.toJSON())).toEqual({
        type: "blockRange",
        anchor: 0,
        head: 20,
      });
      await expect(page.locator(".selection-toolbar-layer")).toBeHidden();
      await page.keyboard.press("Escape");
      await expect(page.locator(`${editorSelector} .editor-block-selection`)).toHaveCount(0);
      await page.keyboard.type("Typing works ");
      await expect(page.locator(editorSelector)).toContainText("Typing works");
    });
  }
}

test("selected ordinary blocks delete together and undo together", async ({ page }) => {
  await setContent(page, "<p>Keep</p><p>Remove one</p><p>Remove two</p>");
  const { rect, gutter } = await geometry(page);
  const rows = page.locator(`${editorSelector} p`);
  const second = await rows.nth(1).boundingBox();
  const third = await rows.nth(2).boundingBox();
  await begin(page, { x: gutter, y: second.y + 1 }, { x: rect.x + 25, y: third.y + 15 });
  await page.mouse.up();
  await page.keyboard.press("Backspace");
  await expect(page.locator(editorSelector)).toHaveText("Keep");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(editorSelector)).toContainText("Remove one");
  await expect(page.locator(editorSelector)).toContainText("Remove two");
});

test("partial list selections keep exact endpoints across a heading and atom", async ({ page }) => {
  await setContent(
    page,
    '<ul><li><p>Keep item</p></li><li><p>Select item</p></li></ul><h2>Select heading</h2><div data-type="meetingBlock"></div><p>Keep after</p>',
  );
  const { rect, gutter } = await geometry(page, "li", 1);
  const item = await page.locator(`${editorSelector} li`).nth(1).boundingBox();
  const meeting = await page.locator(`${editorSelector} .node-meetingBlock`).boundingBox();
  await begin(
    page,
    { x: gutter, y: item.y + 2 },
    { x: rect.x + 25, y: meeting.y + meeting.height - 2 },
  );
  await expect(page.locator(`${editorSelector} li.editor-block-selection`)).toHaveCount(1);
  await expect(page.locator(`${editorSelector} h2.editor-block-selection`)).toHaveCount(1);
  await expect(
    page.locator(`${editorSelector} .node-meetingBlock.editor-block-selection`),
  ).toHaveCount(1);
  await expect(page.locator(`${editorSelector} li`).first()).not.toHaveClass(
    /editor-block-selection/,
  );
  await page.mouse.up();
  const selected = await page.evaluate(() => {
    const { selection } = window.readyEditors.main.state;
    return selection.content().content.textBetween(0, selection.content().content.size);
  });
  expect(selected).toContain("Select item");
  expect(selected).not.toContain("Keep item");
  await page.keyboard.press("Backspace");
  await expect(page.locator(`${editorSelector} .node-meetingBlock`)).toHaveCount(1);
});

test("list item deletion preserves unselected siblings", async ({ page }) => {
  await setContent(
    page,
    "<ul><li><p>First</p></li><li><p>Second</p></li><li><p>Third</p></li></ul><p>After</p>",
  );
  const { rect, block, gutter } = await geometry(page, "li", 1);
  await begin(
    page,
    { x: gutter, y: block.y + 1 },
    { x: rect.x + 60, y: block.y + block.height - 1 },
  );
  await page.mouse.up();
  await expect(page.locator(`${editorSelector} li.editor-block-selection`)).toHaveCount(1);
  await page.keyboard.press("Backspace");
  await expect(page.locator(`${editorSelector} li`)).toHaveText(["First", "Third"]);
});

test("Escape during dragging restores the previous selection and stops the gesture", async ({
  page,
}) => {
  await page.evaluate(() => window.readyEditors.main.commands.setTextSelection({ from: 2, to: 5 }));
  await dragRows(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".editor-block-marquee")).toHaveCount(0);
  expect(await page.evaluate(() => window.readyEditors.main.state.selection.toJSON())).toEqual({
    type: "text",
    anchor: 2,
    head: 5,
  });
  await page.mouse.move(400, 400);
  await page.mouse.up();
  await expect(page.locator(`${editorSelector} .editor-block-selection`)).toHaveCount(0);
});

test("retracting into whitespace clears block highlights; clicks and native text dragging stay native", async ({
  page,
}) => {
  const { rect, block, gutter } = await geometry(page);
  await dragRows(page);
  await page.mouse.move(gutter + 10, block.y + 5);
  await expect(page.locator(`${editorSelector} .editor-block-selection`)).toHaveCount(0);
  await page.mouse.up();
  await page.mouse.click(gutter - 40, block.y + 5);
  await expect(page.locator(".editor-block-marquee")).toHaveCount(0);
  // Move to a fresh paragraph so this drag is independent of the previous
  // gesture's click count and whitespace caret placement.
  const textRow = await page.locator(`${editorSelector} p`).last().boundingBox();
  await page.mouse.move(rect.x + 15, textRow.y + 12);
  await page.mouse.down();
  await page.mouse.move(rect.x + 60, textRow.y + 12, { steps: 5 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.readyEditors.main.state.selection.toJSON().type)).toBe(
    "text",
  );
  await expect(page.locator(".editor-block-marquee")).toHaveCount(0);
});

test("edge scrolling extends a stationary gesture through the editor's scroll pane", async ({
  page,
}) => {
  await setContent(page, Array.from({ length: 40 }, (_, i) => `<p>Row ${i + 1}</p>`).join(""));
  const pane = page.getByTestId("main-pane");
  const paneRect = await pane.boundingBox();
  const { rect, block, gutter } = await geometry(page);
  await begin(
    page,
    { x: gutter, y: block.y + 2 },
    { x: rect.x + 30, y: paneRect.y + paneRect.height - 10 },
  );
  await expect.poll(() => pane.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  await expect
    .poll(() => page.locator(`${editorSelector} .editor-block-selection`).count())
    .toBeGreaterThan(10);
  await page.mouse.up();
  const scrollTop = await pane.evaluate((el) => el.scrollTop);
  await page.waitForTimeout(100);
  expect(await pane.evaluate((el) => el.scrollTop)).toBe(scrollTop);
});

test("document replacement and remote edits dispose an in-progress gesture", async ({ page }) => {
  await dragRows(page);
  await page.evaluate(() => window.readyEditors.main.commands.insertContentAt(1, "Remote edit "));
  await expect(page.locator(".editor-block-marquee")).toHaveCount(0);
  await page.mouse.up();
  await dragRows(page);
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((el) => el.textContent === "Replace local document")
      .click(),
  );
  await expect(page.locator(editorSelector)).toContainText("Local replacement");
  await expect(page.locator(".editor-block-marquee")).toHaveCount(0);
  await page.mouse.up();
  await dragRows(page);
  await page.mouse.up();
  await expect(page.locator(`${editorSelector} .editor-block-selection`)).toHaveCount(1);
});

test("read-only editors and embedded controls do not start marquee selection", async ({ page }) => {
  const { rect, block, gutter } = await geometry(page);
  await page.evaluate(() => window.readyEditors.main.setEditable(false));
  await page.mouse.move(gutter, block.y + 1);
  await page.mouse.down();
  await page.mouse.move(rect.x + 40, block.y + 40, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".editor-block-marquee")).toHaveCount(0);
  await page.evaluate(() => window.readyEditors.main.setEditable(true));
  await setContent(
    page,
    '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Task</p></li></ul>',
  );
  const checkbox = page.locator(editorSelector).getByRole("checkbox");
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await expect(page.locator(".editor-block-marquee")).toHaveCount(0);
});

test("existing block drag moves a completed marquee selection", async ({ page }) => {
  await dragRows(page);
  await page.mouse.up();
  const main = page.getByTestId("main-pane");
  await main
    .locator(".tiptap-editor p")
    .first()
    .hover({ position: { x: 5, y: 10 } });
  await main
    .getByLabel("Open block actions")
    .dragTo(page.getByTestId("side-pane").locator(".tiptap-editor p").last());
  await expect(page.getByTestId("side-pane").locator(".tiptap-editor")).toContainText("Main one");
  await expect(page.getByTestId("side-pane").locator(".tiptap-editor")).toContainText("Main two");
  await expect(main.locator(".tiptap-editor")).not.toContainText("Main one");
});

test("select all expands a partial marquee to the whole document", async ({ page }) => {
  const { rect, block, gutter } = await geometry(page);
  await begin(page, { x: gutter, y: block.y + 2 }, { x: rect.x + 20, y: block.y + 20 });
  await page.mouse.up();
  await expect(page.locator(`${editorSelector} .editor-block-selection`)).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.locator(`${editorSelector} .editor-block-selection`)).toHaveCount(2);
});

test("movement below the threshold keeps a whitespace click as a caret interaction", async ({
  page,
}) => {
  const { block, gutter } = await geometry(page);
  await page.mouse.move(gutter - 40, block.y + 5);
  await page.mouse.down();
  await page.mouse.move(gutter - 38, block.y + 6);
  await expect(page.locator(".editor-block-marquee")).toHaveCount(0);
  await page.mouse.up();
  expect(await page.evaluate(() => window.readyEditors.main.state.selection.empty)).toBe(true);
  await expect(page.locator(`${editorSelector} .editor-block-selection`)).toHaveCount(0);
});

for (const interruption of ["pointercancel", "blur", "readonly"]) {
  test(`${interruption} removes an active marquee and releases its listeners`, async ({ page }) => {
    await dragRows(page);
    await page.evaluate((interruption) => {
      if (interruption === "readonly") window.readyEditors.main.setEditable(false);
      else if (interruption === "blur") window.dispatchEvent(new Event("blur"));
      else document.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 }));
    }, interruption);
    await expect(page.locator(".editor-block-marquee")).toHaveCount(0);
    await expect(page.locator(".editor-marquee-selecting")).toHaveCount(0);
    await page.mouse.up();
    await page.evaluate(() => window.readyEditors.main.setEditable(true));
    // Begin in the opposite gutter to avoid the existing handle's hover area.
    await dragRows(page, { side: true });
    await page.mouse.up();
    await expect(page.locator(`${editorSelector} .editor-block-selection`)).toHaveCount(2);
  });
}

test("dialog gestures stay inside their own editor", async ({ page }) => {
  await page.getByRole("button", { name: "Toggle dialog" }).click();
  const dialog = page.getByTestId("dialog-pane");
  const editor = dialog.locator(".tiptap-editor");
  const rect = await editor.boundingBox();
  const block = await editor.locator("p").boundingBox();
  await begin(page, { x: rect.x - 30, y: block.y + 2 }, { x: rect.x + 40, y: block.y + 20 });
  await expect(editor.locator(".editor-block-selection")).toHaveCount(1);
  await expect(page.locator(`${editorSelector} .editor-block-selection`)).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Dialog editing ");
  await expect(editor).toContainText("Dialog editing");
});

test("embedded database focus clears the outer block selection", async ({ page }) => {
  await dragRows(page);
  await page.mouse.up();
  await expect(page.locator(`${editorSelector} .editor-block-selection`)).toHaveCount(2);
  const database = page.locator(editorSelector).locator("p").first();
  await database.evaluate((node) => {
    node.setAttribute("data-database-marquee-surface", "true");
    node.setAttribute("contenteditable", "false");
    node.tabIndex = -1;
    node.focus();
  });
  await expect(page.locator(`${editorSelector} .editor-block-selection`)).toHaveCount(0);
});
