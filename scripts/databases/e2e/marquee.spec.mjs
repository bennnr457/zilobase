import { test, expect } from "@playwright/test";

const row = (page, index) => page.locator(`[data-database-row-id="row-${index}"]`).first();
const selected = (page) => page.locator('[data-row-selected="true"]');
const options = (page, patch) => page.evaluate((patch) => window.tableProof.options(patch), patch);
async function gesture(page, first = 1, last = 3, side = "left", reverse = false) {
  const a = await row(page, first).boundingBox();
  const b = await row(page, last).boundingBox();
  const surface = await page.locator(".database-table-wrap").first().boundingBox();
  const outside = side === "left" ? surface.x - 100 : surface.x + surface.width + 20;
  const inside = side === "left" ? a.x + Math.min(100, a.width / 2) : a.x + a.width - 20;
  const start = { x: outside, y: reverse ? b.y + b.height - 2 : a.y + 2 };
  const end = { x: inside, y: reverse ? a.y + 2 : b.y + b.height - 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/scripts/databases/e2e/table.html");
  await expect(row(page, 0)).toBeVisible();
});

test("timeline gutter selects records and updates its row checkboxes", async ({ page }) => {
  await page.goto("/scripts/databases/e2e/timeline.html");
  const surface = page.locator(".database-timeline-view");
  await expect(surface).toHaveAttribute("data-database-marquee-surface", "true");
  const first = await surface
    .locator('.database-timeline-sidebar-row[data-timeline-row-id="row-1"]')
    .boundingBox();
  const last = await surface
    .locator('.database-timeline-sidebar-row[data-timeline-row-id="row-3"]')
    .boundingBox();
  const bounds = await surface.boundingBox();
  await page.mouse.move(Math.max(2, bounds.x - 85), first.y + 3);
  await page.mouse.down();
  await page.mouse.move(first.x + 100, last.y + last.height - 3, { steps: 12 });
  await expect(page.locator(".database-record-marquee")).toBeVisible();
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Clear selection of 3 rows" })).toBeVisible();
  for (const index of [1, 2, 3])
    await expect(
      surface.getByRole("checkbox", { name: `Select Task ${index}`, exact: true }),
    ).toBeChecked();
});

for (const side of ["left", "right"])
  for (const reverse of [false, true]) {
    test(`table selects exact rows from ${side}, reverse=${reverse}`, async ({ page }) => {
      await options(page, { columns: ["text"] });
      await gesture(page, 1, 3, side, reverse);
      await expect(page.locator(".database-record-marquee")).toBeVisible();
      await expect(selected(page)).toHaveCount(3);
      await expect(page.locator('.database-table-scroll[role="grid"]')).toBeFocused();
      await page.mouse.up();
      await expect(page.locator(".database-record-marquee")).toHaveCount(0);
      await expect(selected(page)).toHaveCount(3);
      for (const index of [1, 2, 3])
        await expect(
          page.getByRole("checkbox", { name: `Select Record ${index}`, exact: true }),
        ).toBeChecked();
      await expect(page.getByRole("button", { name: "Clear selection of 3 rows" })).toBeVisible();
      expect(await page.evaluate(() => window.tableProof.opened)).toEqual([]);
      await page.getByRole("button", { name: "Clear selection of 3 rows" }).click();
      await expect(selected(page)).toHaveCount(0);
    });
  }

test("Escape, blur and pointer cancellation restore previous row selection", async ({ page }) => {
  await page.getByRole("checkbox", { name: "Select Record 6", exact: true }).check();
  for (const cancel of ["Escape", "blur", "pointercancel"]) {
    await gesture(page);
    await expect(selected(page)).toHaveCount(3);
    if (cancel === "Escape") await page.keyboard.press("Escape");
    else
      await page.evaluate(
        (type) =>
          type === "blur"
            ? window.dispatchEvent(new Event(type))
            : document.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1 })),
        cancel,
      );
    await page.mouse.up();
    await expect(selected(page)).toHaveCount(1);
    await expect(
      page.getByRole("checkbox", { name: "Select Record 6", exact: true }),
    ).toBeChecked();
    await expect(page.locator(".database-record-marquee")).toHaveCount(0);
  }
});

test("retracting into the gutter clears hits; small movements leave selection alone", async ({
  page,
}) => {
  await page.getByRole("checkbox", { name: "Select Record 6", exact: true }).check();
  const a = await row(page, 1).boundingBox();
  await page.mouse.move(a.x - 100, a.y + 2);
  await page.mouse.down();
  await page.mouse.move(a.x - 98, a.y + 3);
  await page.mouse.up();
  await expect(selected(page)).toHaveCount(1);
  await gesture(page);
  await expect(selected(page)).toHaveCount(3);
  await page.mouse.move(a.x - 85, a.y + 10);
  await expect(selected(page)).toHaveCount(0);
  await page.mouse.up();
});

test("cell editing, controls, modified clicks and read-only views keep their handlers", async ({
  page,
}) => {
  await row(page, 1).locator('[data-col-id="text-list"]').click();
  await expect(page.getByRole("textbox", { name: "Text value" })).toBeVisible();
  await page.keyboard.press("Escape");
  const a = await row(page, 1).boundingBox();
  await page.mouse.move(a.x - 100, a.y + 2);
  await page.keyboard.down("Control");
  await page.mouse.down();
  await page.mouse.move(a.x + 100, a.y + 60);
  await page.mouse.up();
  await page.keyboard.up("Control");
  await expect(selected(page)).toHaveCount(0);
  await expect(page.locator(".database-record-marquee")).toHaveCount(0);
  await options(page, { editable: false });
  await gesture(page);
  await page.mouse.up();
  await expect(selected(page)).toHaveCount(0);
});

test("view or editability changes clean up an active gesture and its selection", async ({
  page,
}) => {
  await gesture(page);
  await expect(selected(page)).toHaveCount(3);
  await options(page, { scope: "two" });
  await expect(page.locator(".database-record-marquee")).toHaveCount(0);
  await expect(selected(page)).toHaveCount(0);
  await page.mouse.up();
  await gesture(page);
  await expect(selected(page)).toHaveCount(3);
  await options(page, { editable: false });
  await expect(page.locator(".database-record-marquee")).toHaveCount(0);
  await expect(selected(page)).toHaveCount(0);
  await page.mouse.up();
});

for (const view of ["list", "gallery", "kanban"]) {
  test(`${view} connects marquee highlights to existing bulk actions`, async ({ page }) => {
    await options(page, { view, columns: [], grouped: view === "kanban" });
    const surface = page.locator("[data-database-marquee-surface]");
    await expect(surface).toHaveCount(1);
    const bounds = await surface.boundingBox();
    const first = await row(page, 0).boundingBox();
    await page.mouse.move(bounds.x - 20, first.y + 2);
    await page.mouse.down();
    await page.mouse.move(first.x + first.width / 2, first.y + first.height - 2, { steps: 12 });
    await page.mouse.up();
    await expect(row(page, 0)).toHaveAttribute("data-row-selected", "true");
    await expect(page.getByRole("toolbar", { name: "Selected row actions" })).toBeVisible();
    await page.getByRole("button", { name: "More selected row actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Duplicate", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Clear selection of/ }).click();
    await expect(selected(page)).toHaveCount(0);
  });
}

test("virtualized edge scrolling retains traversed rows and stops on release", async ({ page }) => {
  await options(page, { count: 1000, columns: ["text"] });
  await gesture(page, 1, 3);
  const a = await row(page, 1).boundingBox();
  await page.mouse.move(a.x + 100, 890, { steps: 8 });
  await expect
    .poll(() => page.locator("[data-page-scroll-viewport]").evaluate((node) => node.scrollTop))
    .toBeGreaterThan(600);
  await page.mouse.up();
  await expect(page.locator(".database-record-marquee")).toHaveCount(0);
  const scroll = await page
    .locator("[data-page-scroll-viewport]")
    .evaluate((node) => node.scrollTop);
  // Scroll back to inspect rows that were unmounted during the gesture.
  await page.locator("[data-page-scroll-viewport]").evaluate((node) => (node.scrollTop = 0));
  await expect(row(page, 1)).toHaveAttribute("data-row-selected", "true");
  await expect(page.getByRole("button", { name: /Clear selection of/ })).toBeVisible();
  expect(scroll).toBeGreaterThan(600);
});

test("embedded narrow views and neighboring databases keep row selections independent", async ({
  page,
}) => {
  await options(page, { embedded: true, narrow: true, second: true, columns: ["text"] });
  await expect(page.locator("[data-database-marquee-surface]")).toHaveCount(2);
  await gesture(page);
  await page.mouse.up();
  await expect(page.locator("[data-secondary-database] [data-row-selected]")).toHaveCount(0);
  await expect(selected(page)).toHaveCount(3);
  await page.getByRole("button", { name: "Clear selection of 3 rows" }).click();
  const second = page.locator("[data-secondary-database]");
  const a = await second.locator('[data-database-row-id="row-1"]').boundingBox();
  const b = await second.locator('[data-database-row-id="row-2"]').boundingBox();
  const surface = await second.locator(".database-table-wrap").boundingBox();
  await page.mouse.move(surface.x - 100, a.y + 3);
  await page.mouse.down();
  await page.mouse.move(a.x + 100, b.y + b.height - 3, { steps: 10 });
  await page.mouse.up();
  await expect(second.locator("[data-row-selected]")).toHaveCount(2);
  await expect(selected(page)).toHaveCount(2);
});

test("grouped tables skip collapsed records and prune removed selections", async ({ page }) => {
  await options(page, { grouped: true, columns: ["text"] });
  const group = page.locator(".database-table-group").filter({ hasText: "Open" }).first();
  await group.locator(".database-table-group-toggle").click();
  await expect(row(page, 0)).toHaveCount(0);
  await gesture(page, 1, 5);
  await page.mouse.up();
  await expect(selected(page)).toHaveCount(3);
  await options(page, { count: 4 });
  await expect(selected(page)).toHaveCount(2);
});

test("clipped columns do not make the outer gutter a selectable record area", async ({ page }) => {
  const surface = await page.locator(".database-table-wrap").boundingBox();
  const a = await row(page, 1).boundingBox();
  const b = await row(page, 2).boundingBox();
  await page.mouse.move(surface.x + surface.width + 20, a.y + 2);
  await page.mouse.down();
  await page.mouse.move(surface.x + surface.width + 50, b.y + b.height - 2, { steps: 8 });
  await expect(page.locator(".database-record-marquee")).toBeVisible();
  await expect(selected(page)).toHaveCount(0);
  await page.mouse.move(surface.x + surface.width - 30, b.y + b.height - 2, { steps: 8 });
  await expect(selected(page)).toHaveCount(2);
  await page.mouse.up();
});

for (const corner of ["below-left", "below-right", "above-left"]) {
  test(`standalone database selects rows from ${corner} page whitespace`, async ({ page }) => {
    await options(page, { standalone: true, count: 3, columns: ["text"] });
    const first = await row(page, 0).boundingBox();
    const last = await row(page, 2).boundingBox();
    const surface = await page.locator(".database-table-wrap").boundingBox();
    const start = {
      x: corner === "below-right" ? surface.x + surface.width + 32 : surface.x - 70,
      y: corner === "above-left" ? surface.y - 45 : surface.y + surface.height + 120,
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(
      first.x + 110,
      corner === "above-left" ? last.y + last.height - 2 : first.y + 2,
      { steps: 12 },
    );
    await expect(page.locator(".database-record-marquee")).toBeVisible();
    await expect(selected(page)).toHaveCount(3);
    await page.mouse.up();
    await expect(page.getByRole("button", { name: "Clear selection of 3 rows" })).toBeVisible();
    await page.getByRole("button", { name: "Clear selection of 3 rows" }).click();
    await expect(selected(page)).toHaveCount(0);
  });
}

test("standalone page whitespace does not capture its neighboring pane", async ({ page }) => {
  await options(page, { standalone: true, count: 3, columns: ["text"] });
  const region = await page.locator("[data-database-selection-region]").boundingBox();
  const surface = await page.locator(".database-table-wrap").boundingBox();
  const first = await row(page, 0).boundingBox();
  await page.mouse.move(region.x - 40, surface.y + surface.height + 80);
  await page.mouse.down();
  await page.mouse.move(first.x + 110, first.y + 2, { steps: 10 });
  await expect(page.locator(".database-record-marquee")).toHaveCount(0);
  await page.mouse.up();
  await expect(selected(page)).toHaveCount(0);
});

test("embedded views keep whitespace below their content with the surrounding editor", async ({
  page,
}) => {
  const surface = await page.locator(".database-table-wrap").boundingBox();
  const first = await row(page, 0).boundingBox();
  await page.mouse.move(first.x + 100, surface.y + surface.height + 100);
  await page.mouse.down();
  await page.mouse.move(first.x + 150, first.y + 2, { steps: 10 });
  await expect(page.locator(".database-record-marquee")).toHaveCount(0);
  await page.mouse.up();
  await expect(selected(page)).toHaveCount(0);
});

for (const area of ["heading", "toolbar"]) {
  test(`standalone ${area} container whitespace starts selection`, async ({ page }) => {
    await options(page, { standalone: true, count: 3, columns: ["text"] });
    const blank = await page
      .locator(area === "heading" ? "[data-heading-whitespace]" : "[data-standalone-toolbar]")
      .boundingBox();
    const last = await row(page, 2).boundingBox();
    await page.mouse.move(blank.x + blank.width - 30, blank.y + blank.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + 110, last.y + last.height - 2, { steps: 12 });
    const marquee = page.locator(".database-record-marquee");
    await expect(marquee).toBeVisible();
    await expect(selected(page)).toHaveCount(3);
    await expect(marquee).toHaveCSS("border-top-width", "0px");
    const alpha = await marquee.evaluate((node) => {
      const color = getComputedStyle(node).backgroundColor;
      return Number(color.match(/(?:,|\/)\s*([\d.]+)\s*\)$/)?.[1] ?? 1);
    });
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(0.2);
    await page.mouse.up();
  });
}

test("standalone text and controls retain their native interactions", async ({ page }) => {
  await options(page, { standalone: true, count: 3, columns: ["text"] });
  await page.getByRole("button", { name: "Fixture action" }).click();
  expect(await page.evaluate(() => window.tableProof.actions.includes("fixture-control"))).toBe(
    true,
  );
  await page.getByRole("textbox", { name: "Fixture title" }).fill("Still editable");
  await expect(page.getByRole("textbox", { name: "Fixture title" })).toHaveValue("Still editable");
  const text = await page.getByText("Database heading", { exact: true }).boundingBox();
  const last = await row(page, 2).boundingBox();
  await page.mouse.move(text.x + 5, text.y + text.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + 110, last.y + last.height - 2, { steps: 10 });
  await expect(page.locator(".database-record-marquee")).toHaveCount(0);
  await page.mouse.up();
  await expect(selected(page)).toHaveCount(0);
});
