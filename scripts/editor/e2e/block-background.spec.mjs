import { test, expect } from "@playwright/test";

const paragraph = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
const cases = [
  { type: "callout", selector: ".editor-callout", content: [paragraph("Block color")] },
  {
    type: "codeBlock",
    selector: ".code-block-shiki",
    surface: "[data-slot=code-block]",
    attrs: { language: "plaintext" },
    content: [{ type: "text", text: "const color = 'blue';" }],
  },
  { type: "blockMath", selector: ".tex-block", surface: "> button", attrs: { latex: "E = mc^2" } },
  {
    type: "bookmarkBlock",
    selector: ".bookmark-block",
    surface: "> a",
    attrs: { href: "https://example.com", title: "Bookmark color" },
  },
  {
    type: "fileBlock",
    selector: ".file-block",
    surface: "> a",
    attrs: { href: "https://example.com/file.pdf", title: "File color" },
  },
  { type: "embedBlock", selector: ".embed-block", surface: "> button" },
  { type: "imageBlock", selector: ".image-block", surface: "> button" },
  { type: "videoBlock", selector: ".video-block", surface: "> button" },
  {
    type: "tabsBlock",
    selector: ".editor-tabs",
    content: [{ type: "tabPanel", attrs: { label: "Tab 1" }, content: [paragraph("Tab color")] }],
  },
];

test.beforeEach(async ({ page }) => {
  await page.goto("/scripts/editor/e2e/index.html");
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
});

for (const { selector, surface, ...node } of cases) {
  test(`${node.type} uses the shared background picker and preserves no fill and its border style`, async ({
    page,
  }) => {
    await page.evaluate(
      (node) =>
        window.readyEditors.main.commands.setContent({
          type: "doc",
          content: [node, { type: "paragraph" }],
        }),
      node,
    );
    const main = page.getByTestId("main-pane");
    const block = main.locator(selector);
    const frame = surface ? block.locator(surface) : block;
    const borderWidth = ["codeBlock", "tabsBlock"].includes(node.type) ? "1px" : "0px";
    const matchesToken = (token) =>
      frame.evaluate((el, token) => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = `var(${token})`;
        document.body.append(probe);
        const matches =
          getComputedStyle(el).backgroundColor === getComputedStyle(probe).backgroundColor;
        probe.remove();
        return matches;
      }, token);
    const openColors = async () => {
      await block.hover({ position: { x: 24, y: 10 } });
      await main.getByRole("button", { name: "Open block actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Color", exact: true }).hover();
    };
    await expect(block).toHaveAttribute("data-background-color", "gray");
    await expect.poll(() => matchesToken("--zb-color-surface-background-navigation")).toBe(true);
    for (const side of ["top", "right", "bottom", "left"]) {
      await expect(frame).toHaveCSS(`border-${side}-width`, borderWidth);
    }
    await openColors();
    await expect(page.getByRole("button", { name: /^Gray background/ })).toContainText("Selected");
    await page.getByRole("button", { name: /^Blue background/ }).click();
    await expect(block).toHaveAttribute("data-background-color", "blue");
    await expect.poll(() => matchesToken("--zb-color-palette-background-blue-subtle")).toBe(true);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expect.poll(() => matchesToken("--zb-color-palette-background-blue-subtle")).toBe(true);
    await openColors();
    await page.getByRole("button", { name: /^Default background/ }).click();
    await expect(block).toHaveAttribute("data-background-color", "default");
    await expect(frame).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    for (const side of ["top", "right", "bottom", "left"]) {
      await expect(frame).toHaveCSS(`border-${side}-width`, borderWidth);
    }
    await page.evaluate(() => {
      const editor = window.readyEditors.main;
      editor.commands.setContent(editor.getHTML());
      editor.commands.setContent(editor.getJSON());
    });
    await expect(block).toHaveAttribute("data-background-color", "default");
    await expect(frame).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });
}
