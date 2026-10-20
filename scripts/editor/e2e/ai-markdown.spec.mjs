import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("code remains readable through incomplete fences, language changes and unknown languages", async ({
  page,
}) => {
  await page.goto("/scripts/editor/e2e/ai-components.html");
  const source = page.getByRole("textbox", { name: "Response source" });
  const response = page.getByLabel("Rendered response");
  await source.fill("Inline `value` stays inline.\n\n```typescript\nconst value = 1;");
  await expect(response.locator('[data-slot="code-block"]')).toHaveCount(1);
  await expect(response.locator('[data-slot="code-block-content"]')).toContainText(
    "const value = 1;",
  );
  await expect(response.locator('[data-streamdown="inline-code"]')).toHaveText("value");
  await source.fill(
    "```python\nprint('new language')\n```\n\n```unknown-fixture-language\nraw <text>\n```\n\n中文回答\n\n$$\nx^2\n$$",
  );
  await expect(response.locator('[data-slot="code-block"]')).toHaveCount(2);
  await expect(response.locator('[data-slot="code-block-content"]').first()).toContainText(
    "print('new language')",
  );
  await expect(response.locator('[data-slot="code-block-content"]').last()).toContainText(
    "raw <text>",
  );
  await expect(response.locator(".katex")).toBeVisible();
  await expect(response).toContainText("中文回答");
});

test("code copy preserves literal source and Mermaid retains its diagram renderer", async ({
  page,
}) => {
  await page.goto("/scripts/editor/e2e/ai-components.html");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copiedSource = text;
        },
      },
    });
  });
  const source = page.getByRole("textbox", { name: "Response source" });
  const code = "const value = '<literal>';\n\n// [!code highlight]\n";
  await source.fill("```js\n" + code + "```");
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.copiedSource)).toBe(code);
  await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  await source.fill("```mermaid\ngraph LR\nA --> B\n```");
  await expect(page.locator('[data-streamdown="mermaid-block"]')).toBeVisible();
  await expect(page.getByRole("img", { name: "Mermaid chart" })).toBeVisible();
});

test("code downloads preserve whitespace and literal annotation comments", async ({ page }) => {
  await page.goto("/scripts/editor/e2e/ai-components.html");
  const code = "const value = '<literal>';\n\n// [!code highlight]\n";
  await page.getByRole("textbox", { name: "Response source" }).fill("```js\n" + code + "```");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download code", exact: true }).click(),
  ]);
  expect(await readFile(await download.path(), "utf8")).toBe(code);
});
