import { test, expect } from "@playwright/test";

test("embedded Ask AI block retains its size, focus, and Escape removal", async ({ page }) => {
  await page.goto("/scripts/editor/e2e/index.html");
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await page.evaluate(() =>
    window.readyEditors.main.commands.setContent({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        { type: "askAiBlock" },
        { type: "paragraph", content: [{ type: "text", text: "After" }] },
      ],
    }),
  );
  const block = page.locator(".ask-ai-block");
  const input = block.getByPlaceholder("Ask AI to write in this page...");
  await input.focus();
  await expect(input).toBeFocused();
  await expect(block).toHaveScreenshot("editor-ai-block.png");
  await input.fill("Write a paragraph");
  await expect(block.getByRole("button", { name: "Send prompt", exact: true })).toBeEnabled();
  await input.press("Escape");
  await expect(block).toHaveCount(0);
  expect(await page.evaluate(() => window.readyEditors.main.getText())).toContain("Before");
  expect(await page.evaluate(() => window.readyEditors.main.getText())).toContain("After");
});

test("selection prompt keeps its anchor and leaves the editor selection unchanged", async ({
  page,
}) => {
  await page.goto("/scripts/editor/e2e/index.html");
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.commands.setContent("<p>Selected text stays here.</p>");
    editor.commands.setTextSelection({ from: 1, to: 9 });
    editor.view.focus();
  });
  await page
    .getByRole("toolbar", { name: "Text selection actions" })
    .getByRole("button", { name: "Ask AI", exact: true })
    .click();
  const input = page.getByPlaceholder("Ask AI to rewrite the selection...");
  await expect(input).toBeVisible();
  await expect(page.locator(".selection-ai-menu")).toHaveScreenshot("editor-selection-ai.png");
  await input.fill("Rewrite this");
  await input.press("Enter");
  expect(
    await page.evaluate(() => ({
      from: window.readyEditors.main.state.selection.from,
      to: window.readyEditors.main.state.selection.to,
    })),
  ).toEqual({ from: 1, to: 9 });
  await input.press("Escape");
  await expect(input).toHaveCount(0);
});

for (const width of [1400, 390]) {
  test(`database setup preserves prompt geometry and template submission at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/scripts/editor/e2e/ai-embedded.html");
    const input = page.getByPlaceholder("Describe what you want to build...");
    await expect(input).toBeFocused();
    await expect(page.locator(".database-setup-prompt")).toHaveScreenshot(
      `database-prompt-${width}.png`,
    );
    await input.fill("A project tracker");
    await input.press("Enter");
    await expect(page.getByLabel("Database setup selection")).toContainText(
      '"databaseName":"A project tracker"',
    );
    await expect(page.getByLabel("Database setup selection")).toContainText('"templateId"');
  });
}
