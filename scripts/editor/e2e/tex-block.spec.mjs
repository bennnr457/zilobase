import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/scripts/editor/e2e/index.html");
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
});

async function setEquation(page, latex = "") {
  await page.evaluate((latex) => {
    window.readyEditors.main
      .chain()
      .setContent({
        type: "doc",
        content: [{ type: "blockMath", attrs: { latex } }, { type: "paragraph" }],
      })
      .setMeta("addToHistory", false)
      .run();
  }, latex);
  return page.getByTestId("main-pane").locator(".tex-block");
}

test("slash insertion offers a TeX placeholder, live preview, save, cancel and undo", async ({
  page,
}) => {
  await page.evaluate(() => window.readyEditors.main.commands.setContent("<p></p>"));
  const editor = page.getByTestId("main-pane").locator(".tiptap-editor");
  await editor.click();
  await page.keyboard.type("/equation");
  await page.getByRole("option", { name: /TeX equation/ }).click();
  await page.getByRole("button", { name: "Add a TeX equation" }).click();
  const source = page.getByRole("textbox", { name: "TeX equation source" });
  await expect(source).toBeFocused();
  const latex = String.raw`\frac{a}{b} = \sqrt{c}`;
  await source.fill(latex);
  await expect(page.getByLabel("Equation preview").locator(".katex")).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const block = page.getByTestId("main-pane").locator(".tex-block");
  await expect(block.locator(".katex")).toBeVisible();
  await expect(block).toHaveAttribute("data-latex", latex);
  await block.getByRole("button", { name: "Edit TeX equation" }).click();
  await expect(source).toHaveValue(latex);
  await source.fill("x^2");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(block).toHaveAttribute("data-latex", latex);
  await block.getByRole("button", { name: "Edit TeX equation" }).click();
  await source.fill("x^2");
  await source.press("ControlOrMeta+Enter");
  await expect(block).toHaveAttribute("data-latex", "x^2");
  await page.evaluate(() => window.readyEditors.main.chain().focus().undo().run());
  await expect(block).toHaveAttribute("data-latex", latex);
  expect(await page.evaluate(() => window.readyEditors.side.getText())).toBe(
    "Side one\n\nSide two",
  );
});

test("equations round trip through HTML, Markdown and JSON without editor chrome", async ({
  page,
}) => {
  const latex = String.raw`\begin{aligned}a &= b + c \\ d &= e\end{aligned}`;
  const block = await setEquation(page, latex);
  const serialized = await page.evaluate(() => {
    const editor = window.readyEditors.main;
    return { html: editor.getHTML(), markdown: editor.getMarkdown(), json: editor.getJSON() };
  });
  expect(serialized.html).toContain('data-type="block-math"');
  expect(serialized.html).not.toMatch(/button|katex|textarea/);
  expect(serialized.markdown.trim()).toBe(`$$\n${latex}\n$$`);
  for (const [content, contentType] of [
    [serialized.html, "html"],
    [serialized.markdown, "markdown"],
    [serialized.json, "json"],
  ]) {
    await page.evaluate(
      ({ content, contentType }) => {
        window.readyEditors.main.commands.setContent(content, { contentType });
      },
      { content, contentType },
    );
    await expect(block).toHaveAttribute("data-latex", latex);
    await expect(block.locator(".katex")).toBeVisible();
  }
});

test("the plus menu inserts and selects an empty equation after existing content", async ({
  page,
}) => {
  const pane = page.getByTestId("main-pane");
  await pane.locator(".tiptap-editor p").first().hover();
  await pane.getByRole("button", { name: "Add block below" }).click();
  await page.getByRole("option", { name: /TeX equation/ }).click();
  await expect(pane.getByRole("button", { name: "Add a TeX equation" })).toBeVisible();
  expect(
    await page.evaluate(() => ({
      type: window.readyEditors.main.state.selection.node?.type.name,
      blocks: window.readyEditors.main.getJSON().content.map((node) => node.type),
    })),
  ).toEqual({ type: "blockMath", blocks: ["paragraph", "blockMath", "paragraph"] });
});

test("invalid, stale and read-only equations preserve saved content", async ({ page }) => {
  const block = await setEquation(page, "E = mc^2");
  await block.getByRole("button", { name: "Edit TeX equation" }).click();
  const source = page.getByRole("textbox", { name: "TeX equation source" });
  await source.fill(String.raw`\frac{`);
  await expect(page.getByRole("alert")).toContainText("KaTeX parse error");
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeDisabled();
  await expect(block).toHaveAttribute("data-latex", "E = mc^2");
  await source.fill("x^2");
  await page.evaluate(() =>
    window.readyEditors.main.commands.updateBlockMath({ pos: 0, latex: "y^2" }),
  );
  await expect(page.getByRole("alert")).toContainText("changed while you were editing");
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await block.getByRole("button", { name: "Edit TeX equation" }).click();
  await expect(source).toHaveValue("y^2");
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.setEditable(false);
    editor.view.dispatch(editor.state.tr.setMeta("editorCapabilities", true));
  });
  await expect(source).toHaveCount(0);
  await expect(block.getByRole("button", { name: "Edit TeX equation" })).toBeDisabled();
  await expect(block.locator(".katex")).toBeVisible();
  await expect(block).toHaveAttribute("data-latex", "y^2");
});
