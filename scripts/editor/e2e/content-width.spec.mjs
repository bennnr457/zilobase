import { test, expect } from "@playwright/test";

async function geometry(page) {
  return page.evaluate(() => {
    const title = document.querySelector('[aria-label="Page title"]');
    const rect = (node) => {
      const { left, right, width } = node.getBoundingClientRect();
      return { left, right, width };
    };
    return {
      title: rect(title),
      blocks: [...document.querySelector(".tiptap-editor").children].map(rect),
      comment: document.querySelector('[placeholder="Add a comment..."]')?.closest(".mt-6")
        ? rect(document.querySelector('[placeholder="Add a comment..."]').closest(".mt-6"))
        : null,
      column: rect(title.closest(".page-content-column")),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    };
  });
}

async function expectAligned(page) {
  const value = await geometry(page);
  for (const block of value.blocks) {
    expect(block.left).toBeCloseTo(value.title.left, 0);
    expect(block.right).toBeCloseTo(value.title.right, 0);
  }
  if (value.comment) {
    expect(value.comment.left).toBeCloseTo(value.title.left, 0);
    expect(value.comment.right).toBeCloseTo(value.title.right, 0);
  }
  expect(value.documentWidth).toBeLessThanOrEqual(value.viewportWidth);
  return value;
}

for (const mode of ["plain", "layout", "tabs"]) {
  test(`${mode} page aligns metadata and all blocks at desktop and mobile widths`, async ({
    page,
  }) => {
    await page.goto(`/scripts/editor/e2e/content-width.html?${mode}`);
    await expect(page.locator(".tiptap-editor > p").last()).toHaveText("Last paragraph");
    if (mode === "plain") {
      await page.locator("[data-page-metadata-content]").first().hover();
      await page.getByRole("button", { name: "Add comment", exact: true }).click();
    }
    await expect(page.getByPlaceholder("Add a comment...")).toHaveCount(1);
    const narrow = await expectAligned(page);
    expect(narrow.column.width).toBe(900);
    await page.evaluate(() =>
      document.documentElement.style.setProperty("--page-content-width", "760px"),
    );
    const updated = await expectAligned(page);
    expect(updated.column.width).toBe(760);
    expect(updated.title.width).toBe(narrow.title.width - 140);
    await page.getByRole("button", { name: "Toggle full width" }).click();
    const full = await expectAligned(page);
    expect(full.column.width).toBe(full.viewportWidth);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectAligned(page);
    await page.getByRole("button", { name: "Toggle full width" }).click();
    await expectAligned(page);
    await page.evaluate(() => window.widthEditor.commands.selectAll());
    await expectAligned(page);
  });
}
