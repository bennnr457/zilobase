import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/scripts/editor/e2e/index.html");
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
});

async function setCode(page, source, language = "mermaid") {
  await page.evaluate(
    ({ source, language }) => {
      window.readyEditors.main
        .chain()
        .setContent({
          type: "doc",
          content: [
            {
              type: "codeBlock",
              attrs: { language },
              content: source ? [{ type: "text", text: source }] : [],
            },
          ],
        })
        .setMeta("addToHistory", false)
        .run();
    },
    { source, language },
  );
  return page.getByTestId("main-pane").locator(".code-block-shiki");
}

async function chooseView(page, block, name) {
  await block.getByRole("button", { name: "Mermaid view", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("Mermaid language enables grouped view controls while preserving source, editing and undo", async ({
  page,
}) => {
  const source = "flowchart LR\n  A[Draft] --> B[Published]";
  const block = await setCode(page, source, "plaintext");
  const controls = block.getByRole("group", { name: "Code block controls" });
  await expect(controls.getByRole("button", { name: "Copy code", exact: true })).toBeVisible();
  await expect(controls.getByRole("button", { name: "Mermaid view" })).toHaveCount(0);
  await controls.getByRole("combobox", { name: "Code block language" }).click();
  await page.getByRole("menuitem", { name: "Mermaid", exact: true }).click();
  const diagram = block.locator("svg.pele");
  await expect(diagram).toBeVisible();
  await expect(diagram).toContainText("Published");
  await expect(block.locator("pre")).toBeVisible();
  const sourceColors = () =>
    block
      .locator("code span[data-mermaid-token]")
      .evaluateAll((tokens) =>
        [...new Set(tokens.map((token) => getComputedStyle(token).color))].sort(),
      );
  await expect.poll(async () => (await sourceColors()).length).toBeGreaterThan(1);
  const lightColors = await sourceColors();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect.poll(sourceColors).not.toEqual(lightColors);
  await expect.poll(async () => (await sourceColors()).length).toBeGreaterThan(1);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await block.locator("code").evaluate((element) => (window.originalCodeElement = element));
  const before = await page.evaluate(() => window.readyEditors.main.getJSON());

  await chooseView(page, block, "Preview");
  await expect(block.locator("pre")).toBeHidden();
  await expect(diagram).toBeVisible();
  await chooseView(page, block, "Code");
  await expect(block.locator("pre")).toBeVisible();
  await expect(diagram).toHaveCount(0);
  await expect.poll(async () => (await sourceColors()).length).toBeGreaterThan(1);
  await chooseView(page, block, "Split view");
  await expect(block.locator("pre")).toBeVisible();
  await expect(diagram).toBeVisible();
  expect(await page.evaluate(() => window.readyEditors.main.getJSON())).toEqual(before);
  expect(
    await block.locator("code").evaluate((element) => element === window.originalCodeElement),
  ).toBe(true);

  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.commands.setTextSelection(editor.state.doc.firstChild.nodeSize - 1);
    editor.view.focus();
  });
  await page.keyboard.type("\n  B --> C[Archived]");
  await expect(diagram).toContainText("Archived");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(block.locator("code")).toHaveText(source);
  await expect(diagram).not.toContainText("Archived");
  const html = await page.evaluate(() => window.readyEditors.main.getHTML());
  expect(html).toContain('class="language-mermaid"');
  expect(html).not.toContain("svg");
  expect(html).not.toContain("Mermaid view");
});

test("Pele handles empty and invalid source, sanitizes labels and follows the app theme", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const block = await setCode(page, "");
  await expect(block.getByText("Write Mermaid code to preview a diagram.")).toBeVisible();
  await setCode(page, "flowchart TD\n  A[");
  await expect(block.locator(".pele-error")).toBeVisible();
  await expect(block.locator("pre")).toBeVisible();
  await setCode(page, 'flowchart LR\n  A["<img src=x onerror=alert(1)>"] --> B[Safe]');
  const diagram = block.locator("svg.pele");
  await expect(diagram).toBeVisible();
  await expect(diagram).toContainText("Safe");
  await expect(block.locator(".pele-error")).toHaveCount(0);
  await expect(block.locator("script, img, [onerror], [onload]")).toHaveCount(0);
  const light = await diagram.evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--pele-fg"),
  );
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  const dark = await diagram.evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--pele-fg"),
  );
  expect(dark).not.toBe(light);
  expect(errors).toEqual([]);
});

test("read-only Mermaid blocks allow keyboard view changes and copy the literal source", async ({
  page,
}) => {
  const source = "sequenceDiagram\n  Alice->>Bob: Hello\n";
  const block = await setCode(page, source);
  await page.evaluate(() => {
    window.codeCopied = [];
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async (text) => window.codeCopied.push(text),
    });
    const editor = window.readyEditors.main;
    editor.setEditable(false);
    editor.view.dispatch(editor.state.tr.setMeta("editorCapabilities", true));
  });
  const before = await page.evaluate(() => window.readyEditors.main.getJSON());
  await expect(block.getByRole("combobox", { name: "Code block language" })).toBeDisabled();
  const viewButton = block.getByRole("button", { name: "Mermaid view", exact: true });
  await viewButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Code", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Split view", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(block.locator("pre")).toBeHidden();
  await expect(block.locator("svg.pele")).toBeVisible();
  await block.getByRole("button", { name: "Copy code", exact: true }).click();
  await expect(block.getByRole("button", { name: "Copied code", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.codeCopied)).toEqual([source]);
  expect(await page.evaluate(() => window.readyEditors.main.getJSON())).toEqual(before);
});
