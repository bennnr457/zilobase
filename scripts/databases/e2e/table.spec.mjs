import { test, expect } from "@playwright/test";
const cell = (page, row, col) =>
  page.locator(
    `[data-database-row-id="row-${row}"] td[data-col-id="${col === "name" ? col : col + "-list"}"]`,
  );
const options = (page, value) => page.evaluate((value) => window.tableProof.options(value), value);
const grid = (page) => page.locator('.database-table-scroll[role="grid"]');
async function select(page, row, col) {
  await grid(page).focus();
  await page.keyboard.press("Escape");
  await cell(page, row, col).click({ modifiers: ["Control"] });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(grid(page)).toBeFocused();
}
async function paste(page, text) {
  await grid(page).evaluate((node, text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);
    node.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
    );
  }, text);
}
async function values(page) {
  return page.evaluate(() => window.tableProof.values());
}

const pageErrors = new WeakMap();
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});
test.beforeEach(async ({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/scripts/databases/e2e/table.html");
  await expect(cell(page, 0, "text")).toBeVisible();
});

test("ReUI renders the actual table at 32px and keeps single-click editors and page opening", async ({
  page,
}) => {
  await expect(page.locator('table[data-slot="data-grid-table"]')).toHaveCount(1);
  const heights = await page
    .locator("[data-database-row-id]")
    .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(heights.every((height) => height === 32)).toBe(true);
  await cell(page, 0, "text").click();
  await expect(page.getByRole("textbox", { name: "Text value" })).toBeVisible();
  await page.keyboard.press("Escape");
  await cell(page, 0, "name").hover();
  await cell(page, 0, "name").getByRole("button", { name: "Open Record 0", exact: true }).click();
  expect(await page.evaluate(() => window.tableProof.opened)).toEqual(["page-0"]);
});

test("Add property fills the available width while record columns keep their sizes", async ({
  page,
}) => {
  await options(page, { columns: [] });
  const geometry = () =>
    page.evaluate(() => {
      const viewport = document.querySelector('.database-table-scroll[role="grid"]');
      const tables = [...document.querySelectorAll(".database-table")];
      return {
        viewport: viewport.getBoundingClientRect().width,
        tables: tables.map((table) => ({
          width: table.getBoundingClientRect().width,
          columns: [...table.querySelectorAll("col")].map(
            (col) => col.getBoundingClientRect().width,
          ),
        })),
      };
    });
  await expect
    .poll(async () => (await geometry()).tables[0].width)
    .toBeCloseTo((await geometry()).viewport, 0);
  let measured = await geometry();
  expect(measured.tables[0].columns[0]).toBe(250);
  expect(measured.tables[0].columns[1]).toBeCloseTo(measured.viewport - 250, 0);
  await options(page, { embedded: true, grouped: true });
  await expect(page.locator(".database-table-group")).toHaveCount(3);
  measured = await geometry();
  for (const table of measured.tables) {
    expect(table.width).toBeCloseTo(measured.viewport, 0);
    expect(table.columns[0]).toBe(250);
    expect(table.columns[1]).toBeCloseTo(measured.viewport - 250, 0);
  }
  await options(page, { grouped: false, count: 0 });
  await expect(page.getByRole("button", { name: "New page", exact: true })).toBeVisible();
  measured = await geometry();
  expect(measured.tables[0].width).toBeCloseTo(measured.viewport, 0);
  await page.setViewportSize({ width: 500, height: 800 });
  await expect.poll(async () => (await geometry()).tables[0].width).toBe(450);
  measured = await geometry();
  expect(measured.tables[0].columns[0]).toBe(250);
  expect(measured.tables[0].columns[1]).toBe(200);
});

test("keyboard edits and multi-cell paste use existing saves and one undo", async ({ page }) => {
  await select(page, 0, "text");
  await page.keyboard.press("F2");
  const editor = page.getByRole("textbox", { name: "Text", exact: true });
  await expect(editor).toBeVisible();
  await editor.fill("Keyboard text");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await values(page))["page-0:text"]).toBe("Keyboard text");
  await paste(page, "Pasted\t12\tDone\nSecond\t13\tOpen");
  await expect.poll(async () => (await values(page))["page-1:number"]).toBe("13");
  expect((await values(page))["page-0:status"]).toBe("Done");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await values(page))["page-0:text"]).toBe("Keyboard text");
  expect((await values(page))["page-1:number"]).toBe("1");
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await values(page))["page-1:number"]).toBe("13");
});

test("group headings, empty groups and creation rows stay outside spreadsheet selection", async ({
  page,
}) => {
  await options(page, { grouped: true });
  await expect(page.locator(".database-table-group")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Name column options" })).toHaveCount(1);
  await select(page, 0, "text");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
  await expect(cell(page, 1, "text")).toHaveAttribute("data-cell-focused", "true");
  await page.keyboard.press("Control+a");
  await expect(page.locator("td[data-cell-selected]")).toHaveCount(32);
  await page.locator(".database-table-group-toggle").first().click();
  await expect(cell(page, 0, "text")).toHaveCount(0);
  await expect(page.locator("td[data-cell-selected]")).toHaveCount(0);
  await page
    .locator(".database-table-group")
    .last()
    .getByRole("button", { name: "New page", exact: true })
    .click();
  expect(await page.evaluate(() => window.tableProof.actions)).toContainEqual({
    create: true,
    group: "Waiting",
  });
});

test("range dragging and fill do not open controls and fill is one undoable batch", async ({
  page,
}) => {
  const start = await cell(page, 0, "text").boundingBox();
  const end = await cell(page, 2, "number").boundingBox();
  await page.mouse.move(start.x + 5, start.y + 5);
  await page.mouse.down();
  await page.mouse.move(end.x + 5, end.y + 5, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator("td[data-cell-selected]")).toHaveCount(6);
  await expect(grid(page)).toBeFocused();
  await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await select(page, 0, "text");
  const handle = cell(page, 0, "text").locator('[data-slot="data-grid-cell-fill-handle"]');
  const h = await handle.boundingBox(),
    target = await cell(page, 3, "text").boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await expect(page.locator('[data-slot="data-grid-cell-fill-preview"]')).toBeVisible();
  await page.mouse.up();
  await expect.poll(async () => (await values(page))["page-3:text"]).toBe("Text 0");
  await grid(page).focus();
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await values(page))["page-3:text"]).toBe("Text 3");
});

test("typed titles and properties form one paste history action and invalid cells are rejected", async ({
  page,
}) => {
  await select(page, 0, "name");
  await paste(page, "New title\tNew text\tinvalid number\tMissing status");
  await expect(cell(page, 0, "name")).toContainText("New title");
  expect((await values(page))["page-0:text"]).toBe("New text");
  expect((await values(page))["page-0:number"]).toBe("0");
  expect((await values(page))["page-0:status"]).toBe("Open");
  await expect(page.getByText("2 cells were skipped", { exact: false })).toBeVisible();
  await grid(page).focus();
  await page.keyboard.press("Control+z");
  await expect(cell(page, 0, "name")).toContainText("Record 0");
  expect((await values(page))["page-0:text"]).toBe("Text 0");
});

test("date ranges, booleans, people and multi-select retain typed values", async ({ page }) => {
  await options(page, { columns: ["date", "check", "person", "tags"] });
  await select(page, 0, "date");
  await paste(page, '["2026-10-17","2026-10-19"]\tyes\tAda\t["A","B"]');
  await expect
    .poll(async () => (await values(page))["page-0:date"])
    .toEqual(["2026-10-17", "2026-10-19"]);
  expect((await values(page))["page-0:check"]).toBe("true");
  expect((await values(page))["page-0:person"]).toEqual(["ada"]);
  expect((await values(page))["page-0:tags"]).toEqual(["A", "B"]);
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await values(page))["page-0:date"]).toBe("");
});

test("read-only views allow selection and opening but never spreadsheet writes", async ({
  page,
}) => {
  await options(page, { editable: false });
  await select(page, 0, "text");
  await paste(page, "Forbidden");
  await page.keyboard.press("Delete");
  await page.keyboard.press("F2");
  await page.keyboard.type("Forbidden");
  expect((await values(page))["page-0:text"]).toBe("Text 0");
  expect(await page.evaluate(() => window.tableProof.writes)).toHaveLength(0);
  await expect(page.locator('[data-slot="data-grid-cell-editor"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="data-grid-cell-fill-handle"]')).toHaveCount(0);
  await expect(page.locator(".database-table-create")).toHaveCount(0);
});

test("failed saves and later remote changes are not overwritten by undo", async ({ page }) => {
  await options(page, { failSave: true, failTitle: true });
  await select(page, 0, "text");
  await paste(page, "Failed");
  expect((await values(page))["page-0:text"]).toBe("Text 0");
  await page.keyboard.press("Control+z");
  expect(await page.evaluate(() => window.tableProof.writes.length)).toBe(1);
  await options(page, { failSave: false });
  await select(page, 0, "text");
  await paste(page, "Saved");
  await expect.poll(async () => (await values(page))["page-0:text"]).toBe("Saved");
  await page.evaluate(() => window.tableProof.remote({ "page-0:text": "Remote" }));
  await grid(page).focus();
  await page.keyboard.press("Control+z");
  expect((await values(page))["page-0:text"]).toBe("Remote");
});

test("wrapped cells grow on request and rail centers follow measured rows", async ({ page }) => {
  await page.evaluate(() => window.tableProof.remote({ "page-0:text": "Long text ".repeat(80) }));
  expect(await cell(page, 0, "text").evaluate((el) => el.getBoundingClientRect().height)).toBe(32);
  await options(page, { wrap: true });
  await expect
    .poll(() => cell(page, 0, "text").evaluate((el) => el.getBoundingClientRect().height))
    .toBeGreaterThan(60);
  expect((await cell(page, 1, "text").boundingBox()).height).toBe(32);
  await page.getByRole("checkbox", { name: "Select Record 0", exact: true }).check();
  const delta = await page
    .getByRole("checkbox", { name: "Select Record 0", exact: true })
    .evaluate((el) => {
      const a = el.getBoundingClientRect(),
        b = document.querySelector('[data-database-row-id="row-0"]').getBoundingClientRect();
      return Math.abs(a.top + a.height / 2 - b.top - b.height / 2);
    });
  expect(delta).toBeLessThanOrEqual(1);
});

test("keyboard navigation crosses virtual windows and keeps the active editor mounted", async ({
  page,
}) => {
  await options(page, { count: 10000 });
  await select(page, 0, "text");
  await page.keyboard.press("Control+ArrowDown");
  await expect(cell(page, 9999, "text")).toHaveAttribute("data-cell-focused", "true");
  await expect(cell(page, 9999, "text")).toBeInViewport();
  expect(await page.locator("[data-database-row-id]").count()).toBeLessThan(100);
  await page.keyboard.press("F2");
  await expect(page.getByRole("textbox", { name: "Text", exact: true })).toBeVisible();
  await page.locator("[data-page-scroll-viewport]").evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(cell(page, 9999, "text")).toBeAttached();
  await page.keyboard.press("Escape");
  await grid(page).focus();
  await page.keyboard.press("Control+ArrowUp");
  await expect(cell(page, 0, "text")).toHaveAttribute("data-cell-focused", "true");
  await expect(cell(page, 0, "text")).toBeInViewport();
});

test("nested children collapse without entering structural creation rows", async ({ page }) => {
  await options(page, { nested: true });
  await expect(page.getByRole("button", { name: "Collapse sub-items for Record 0" })).toBeVisible();
  await expect(cell(page, 1, "name")).toBeVisible();
  await page.getByRole("button", { name: "Collapse sub-items for Record 0" }).click();
  await expect(cell(page, 1, "name")).toHaveCount(0);
  await select(page, 0, "text");
  await page.keyboard.press("ArrowDown");
  await expect(cell(page, 2, "text")).toHaveAttribute("data-cell-focused", "true");
  await page.getByRole("button", { name: "Expand sub-items for Record 0" }).click();
  await expect(page.getByRole("button", { name: "New sub-item", exact: true })).toBeVisible();
});

test("clipboard copy, cut and undo retain typed cells and editor clipboard stays native", async ({
  page,
}) => {
  await select(page, 0, "text");
  await page.keyboard.press("Shift+ArrowRight");
  const copied = await grid(page).evaluate((node) => {
    const clipboardData = new DataTransfer();
    node.dispatchEvent(
      new ClipboardEvent("copy", { clipboardData, bubbles: true, cancelable: true }),
    );
    return clipboardData.getData("text/plain");
  });
  expect(copied).toBe("Text 0\t0");
  await grid(page).evaluate((node) => {
    node.dispatchEvent(
      new ClipboardEvent("cut", {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect.poll(async () => (await values(page))["page-0:text"]).toBe("");
  expect((await values(page))["page-0:number"]).toBe("");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await values(page))["page-0:text"]).toBe("Text 0");
  expect((await values(page))["page-0:number"]).toBe("0");
  await page.keyboard.press("F2");
  const editor = page.getByRole("textbox", { name: "Text", exact: true });
  await editor.fill("Do not save");
  await editor.evaluate((node) =>
    node.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  expect((await values(page))["page-0:text"]).toBe("Text 0");
});

test("keyboard specialized editors, additive selection and stale view history remain scoped", async ({
  page,
}) => {
  await select(page, 0, "status");
  await page.keyboard.press("F2");
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await select(page, 0, "text");
  await cell(page, 3, "number").click({ modifiers: ["Control"] });
  await expect(page.locator("td[data-cell-selected]")).toHaveCount(2);
  await grid(page).focus();
  await page.keyboard.press("Escape");
  await expect(page.locator("td[data-cell-selected]")).toHaveCount(0);
  await select(page, 0, "text");
  await paste(page, "View one");
  await options(page, { scope: "two" });
  await expect(page.locator("td[data-cell-selected]")).toHaveCount(0);
  await grid(page).focus();
  await page.keyboard.press("Control+z");
  expect((await values(page))["page-0:text"]).toBe("View one");
});

test("row selection and property menus remain functional without extra utility cells", async ({
  page,
}) => {
  await options(page, { readOnlyProperties: true });
  expect(await page.locator('[data-database-row-id="row-0"] > td').count()).toBe(4);
  await page.getByRole("checkbox", { name: "Select Record 0", exact: true }).check();
  await page.getByRole("checkbox", { name: "Select Record 1", exact: true }).check();
  await expect(page.getByRole("toolbar", { name: "Selected row actions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear selection of 2 rows" })).toBeVisible();
  await expect(page.locator('[data-row-selected="true"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Clear selection of 2 rows" }).click();
  await expect(page.locator('[data-row-selected="true"]')).toHaveCount(0);
  await options(page, { readOnlyProperties: false });
  await page.getByRole("button", { name: "Name column options" }).click();
  await expect(page.getByRole("menuitem", { name: /Wrap content/ })).toBeVisible();
});

async function rowMenu(page, index) {
  await cell(page, index, "name").hover();
  await page.getByRole("button", { name: `Drag Record ${index}`, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Search selected row actions" })).toBeFocused();
  await expect(page.getByRole("menuitem", { name: "Duplicate", exact: true })).toBeEnabled();
}

test("handle and More share one menu and preserve or replace checkbox selection appropriately", async ({
  page,
}) => {
  await page
    .getByRole("checkbox", { name: "Select Record 0", exact: true, includeHidden: true })
    .check();
  await page.getByRole("checkbox", { name: "Select Record 1", exact: true }).check();
  await rowMenu(page, 0);
  await expect(
    page.getByRole("button", { name: "Clear selection of 2 rows", includeHidden: true }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Open in", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  const labels = await page.locator('[role="menu"] > [role="menuitem"]').allTextContents();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More selected row actions" }).click();
  expect(await page.locator('[role="menu"] > [role="menuitem"]').allTextContents()).toEqual(labels);
  await expect(
    page.locator('[role="toolbar"][aria-label="Selected row actions"] button'),
  ).toHaveCount(3);
  await page.keyboard.press("Escape");
  await rowMenu(page, 2);
  await expect(
    page.getByRole("button", { name: "Clear selection of 1 rows", includeHidden: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Select Record 0", exact: true, includeHidden: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Select Record 2", exact: true, includeHidden: true }),
  ).toBeChecked();
  await page.evaluate(() => window.tableProof.options({ scope: "another-view" }));
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "Selected row actions" })).toHaveCount(0);
});

test("action search and bulk property editing retain one undo across the selected records", async ({
  page,
}) => {
  await page
    .getByRole("checkbox", { name: "Select Record 0", exact: true, includeHidden: true })
    .check();
  await page.getByRole("checkbox", { name: "Select Record 1", exact: true }).check();
  await page.getByRole("button", { name: "More selected row actions" }).click();
  const search = page.getByRole("textbox", { name: "Search selected row actions" });
  await search.fill("no matching action");
  await expect(page.getByText("No actions found.")).toBeVisible();
  await search.fill("Text");
  await page.getByRole("menuitem", { name: "Edit property", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Text", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Text value for selected rows" });
  await expect(editor).toHaveAttribute("placeholder", "Replace mixed values");
  await editor.fill("Bulk value");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(cell(page, 0, "text")).toContainText("Bulk value");
  await expect(cell(page, 1, "text")).toContainText("Bulk value");
  await grid(page).focus();
  await page.keyboard.press("Control+z");
  await expect(cell(page, 0, "text")).toContainText("Text 0");
  await expect(cell(page, 1, "text")).toContainText("Text 1");
});

test("row actions favorite, duplicate, and trash through the shared operations", async ({
  page,
}) => {
  await rowMenu(page, 0);
  await page.getByRole("menuitem", { name: "Add to Favorites", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.tableProof.favorites.has("page-0")))
    .toBe(true);
  await rowMenu(page, 0);
  await expect(
    page.getByRole("menuitem", { name: "Remove from Favorites", exact: true }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect(page.locator('[data-database-row-id="row-10000"]')).toContainText("Record 0 (copy)");
  await expect(
    page.getByRole("checkbox", { name: "Select Record 0 (copy)", exact: true }),
  ).toBeChecked();
  await expect(
    page.locator('[data-database-row-id="row-10000"] td[data-col-id="text-list"]'),
  ).toContainText("Text 0");
  await page
    .getByRole("button", { name: "Move selected rows to Trash", includeHidden: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator('[data-database-row-id="row-10000"]')).toBeVisible();
  await page
    .getByRole("button", { name: "Move selected rows to Trash", includeHidden: true })
    .click();
  await page.getByRole("button", { name: "Move to Trash", exact: true }).click();
  await expect(page.locator('[data-database-row-id="row-10000"]')).toHaveCount(0);
  await expect(cell(page, 0, "name")).toContainText("Record 0");
});

test("bulk icon changes preserve metadata and keep failed records selected for retry", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.tableProof.pageMetadata.set("page-0", { emoji: "📌", cover: "cover-zero" });
    window.tableProof.pageMetadata.set("page-1", { emoji: "🚀", cover: "cover-one" });
    window.tableProof.rejectedPageActions.add("page-1");
  });
  await page.getByRole("checkbox", { name: "Select Record 0", exact: true }).check();
  await page.getByRole("checkbox", { name: "Select Record 1", exact: true }).check();
  await page.getByRole("button", { name: "More selected row actions" }).click();
  await page.getByRole("menuitem", { name: "Edit icon", exact: true }).click();
  await page.getByRole("button", { name: "Remove icon", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.tableProof.pageMetadata.get("page-0")))
    .toEqual({ emoji: null, cover: "cover-zero" });
  await expect(page.getByRole("button", { name: "Clear selection of 1 rows" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Select Record 1", exact: true })).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Select Record 0", exact: true }),
  ).not.toBeChecked();
  await page.evaluate(() => window.tableProof.rejectedPageActions.clear());
  await page.getByRole("button", { name: "More selected row actions" }).click();
  await page.getByRole("menuitem", { name: "Edit icon", exact: true }).click();
  await page.getByRole("button", { name: "Remove icon", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.tableProof.pageMetadata.get("page-1")))
    .toEqual({ emoji: null, cover: "cover-one" });
});

test("row action modes are per-call and menu closes on account changes", async ({ page }) => {
  await rowMenu(page, 0);
  await page.getByRole("menuitem", { name: "Open in", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Dialog", exact: true }).click();
  expect(await page.evaluate(() => window.tableProof.openedOptions.at(-1))).toMatchObject({
    presentation: "dialog",
    databaseId: "source",
  });
  await rowMenu(page, 0);
  await page.getByRole("menuitem", { name: "Comment", exact: true }).click();
  expect(await page.evaluate(() => window.tableProof.openedOptions.at(-1))).toMatchObject({
    focusComment: true,
  });
  await rowMenu(page, 0);
  await page.evaluate(() => window.tableProof.identity("different-account"));
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("readonly page permissions disable writes while retaining record opening", async ({
  page,
}) => {
  await options(page, { pageAccess: "view" });
  await cell(page, 0, "name").hover();
  await page.getByRole("button", { name: "Drag Record 0", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Duplicate", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.getByRole("menuitem", { name: "Edit icon", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.getByRole("menuitem", { name: "Open in", exact: true })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Move selected rows to Trash", includeHidden: true }),
  ).toBeDisabled();
});

test("keyboard handle activation and moving records to a page preserve existing drag behavior", async ({
  page,
}) => {
  const handle = page.getByRole("button", { name: "Drag Record 0", exact: true });
  await handle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Search selected row actions" })).toBeFocused();
  await expect(page.getByRole("menuitem", { name: "Move to", exact: true })).toBeEnabled();
  await page.getByRole("menuitem", { name: "Move to", exact: true }).click();
  await page.getByRole("button", { name: "Destination", exact: true }).click();
  await expect(cell(page, 0, "name")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      window.tableProof.writes.some((write) => write.command?.type === "row.moveToPage"),
    ),
  ).toBe(true);
});

for (const destination of ["Open", "Waiting"]) {
  test(`row rail dragging supports appending above New page in ${destination}`, async ({
    page,
  }) => {
    await options(page, { grouped: true });
    const group = page
      .locator(".database-table-group")
      .filter({ has: page.locator(".database-table-group-toggle", { hasText: destination }) });
    const footer = await group.locator("[data-database-row-drop-footer]").boundingBox();
    const handle = await page
      .getByRole("button", { name: "Drag Record 1", exact: true })
      .boundingBox();
    await page.mouse.move(handle.x + 8, handle.y + 8);
    await page.mouse.down();
    await page.mouse.move(handle.x + 8, handle.y + 22, { steps: 4 });
    await expect(page.locator(".database-row-drag-overlay")).toBeVisible();
    await page.mouse.move(footer.x + 100, footer.y + 16, { steps: 15 });
    await page.mouse.move(footer.x + 101, footer.y + 16);
    await expect(page.locator(".database-row-drop-line")).toBeVisible();
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate(() => window.tableProof.writes.filter((w) => w.command).length))
      .toBe(1);
    expect((await values(page))["page-1:status"]).toBe(destination);
    await expect(page.locator(".database-row-drag-overlay")).toHaveCount(0);
  });
}

test("external page drops target an empty group creation row", async ({ page }) => {
  await options(page, { grouped: true });
  const group = page.locator(".database-table-group").last();
  const footer = await group.locator("[data-database-row-drop-footer]").boundingBox();
  const dataTransfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.setData(
      "application/x-zilobase-database-page",
      JSON.stringify({ pageId: "external-test", title: "External record" }),
    );
    return data;
  });
  const target = page.locator(".database-table-wrap");
  await target.dispatchEvent("dragover", {
    dataTransfer,
    clientX: footer.x + 100,
    clientY: footer.y + 16,
  });
  await expect(page.locator(".database-row-drop-line")).toBeVisible();
  await target.dispatchEvent("drop", {
    dataTransfer,
    clientX: footer.x + 100,
    clientY: footer.y + 16,
  });
  await expect(group).toContainText("External record");
  expect(await page.evaluate(() => window.tableProof.actions)).toContainEqual({
    external: { pageId: "external-test", title: "External record" },
    group: "Waiting",
  });
});

test("column resize preserves cell geometry in embedded and narrow layouts", async ({ page }) => {
  await options(page, { embedded: true });
  const header = page.locator('[data-property-id="text-list"]').first();
  const handle = header.locator(".database-column-resize-handle");
  const before = await cell(page, 0, "text").boundingBox(),
    h = await handle.boundingBox();
  await page.mouse.move(h.x + 0.5, h.y + 10);
  await page.mouse.down();
  await page.mouse.move(h.x + 60.5, h.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await cell(page, 0, "text").boundingBox()).width)
    .toBeCloseTo(before.width + 60, 0);
  await page.setViewportSize({ width: 640, height: 800 });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await select(page, 0, "text");
  await paste(page, "Narrow embedded");
  await expect(cell(page, 0, "text")).toContainText("Narrow embedded");
  expect((await cell(page, 0, "text").boundingBox()).height).toBe(32);
});

for (const sorted of [false, true]) {
  test(`${sorted ? "sorted" : "filtered"} row placement retains the existing movement controller`, async ({
    page,
  }) => {
    await options(page, { filtered: !sorted, sorted });
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    const handle = page.getByRole("button", { name: "Drag Record 0", exact: true });
    const from = await cell(page, 0, "name").boundingBox(),
      target = await cell(page, sorted ? 5 : 4, "name").boundingBox();
    await handle.dispatchEvent("dragstart", {
      dataTransfer: transfer,
      clientX: from.x - 40,
      clientY: from.y + 16,
    });
    const root = page.locator(".database-table-wrap");
    await root.dispatchEvent("dragover", {
      dataTransfer: transfer,
      clientX: target.x + 70,
      clientY: target.y + 25,
    });
    await expect(page.locator(".database-row-drop-line")).toBeVisible();
    await root.dispatchEvent("drop", {
      dataTransfer: transfer,
      clientX: target.x + 70,
      clientY: target.y + 25,
    });
    if (sorted) {
      await expect(page.getByRole("alertdialog")).toContainText("Clear sorting to reorder?");
      expect(await page.evaluate(() => window.tableProof.writes.length)).toBe(0);
      await page.getByRole("button", { name: "Clear sorting", exact: true }).click();
    }
    await expect
      .poll(() => page.evaluate(() => window.tableProof.writes.filter((w) => w.command).length))
      .toBe(1);
    const command = await page.evaluate(
      () => window.tableProof.writes.find((w) => w.command).command,
    );
    expect(command).toMatchObject({
      rowId: "row-0",
      placement: {
        afterRowId: sorted ? "row-3" : "row-5",
        beforeRowId: sorted ? "row-4" : "row-6",
      },
    });
    if (sorted) expect(command.clearSortViewId).toBe("one");
  });
}

test("keyboard range selection crosses virtualized groups and skipped computed cells stay intact", async ({
  page,
}) => {
  await options(page, {
    count: 3000,
    grouped: true,
    columns: ["text", "formula", "relation", "files"],
  });
  await select(page, 0, "text");
  await page.keyboard.press("Control+Shift+ArrowDown");
  await expect(cell(page, 2999, "text")).toBeInViewport();
  await paste(page, "Group text\tcomputed\trelation\tfile");
  expect((await values(page))["page-0:text"]).toBe("Group text");
  expect((await values(page))["page-0:formula"]).toBeUndefined();
  expect((await values(page))["page-0:relation"]).toBeUndefined();
  expect((await values(page))["page-0:files"]).toBeUndefined();
  expect(await page.locator("[data-database-row-id]").count()).toBeLessThan(130);
});

test("delayed clipboard cuts cannot write across an account change", async ({ page }) => {
  await select(page, 0, "text");
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "write", {
      configurable: true,
      value: () =>
        new Promise((resolve) => {
          window.releaseClipboard = resolve;
        }),
    }),
  );
  await page.keyboard.press("Control+x");
  await page.waitForFunction(() => typeof window.releaseClipboard === "function");
  await page.evaluate(() => window.tableProof.identity("different-account"));
  await expect(page.locator("td[data-cell-selected]")).toHaveCount(0);
  await page.evaluate(() => window.releaseClipboard());
  await expect(cell(page, 0, "text")).toContainText("Text 0");
  expect(await page.evaluate(() => window.tableProof.writes)).toEqual([]);
});

test("keyboard editing retains multiline text and Escape cancels without a write", async ({
  page,
}) => {
  await page.evaluate(() => window.tableProof.remote({ "page-0:text": "First line\nSecond line" }));
  await select(page, 0, "text");
  await page.keyboard.press("F2");
  const editor = page.getByRole("textbox", { name: "Text", exact: true });
  await expect(editor).toHaveValue("First line\nSecond line");
  await editor.fill("Cancelled replacement");
  await page.keyboard.press("Escape");
  expect((await values(page))["page-0:text"]).toBe("First line\nSecond line");
  expect(await page.evaluate(() => window.tableProof.writes)).toEqual([]);
});

test("pending cuts and undo cannot overwrite a property converted to a computed field", async ({
  page,
}) => {
  await select(page, 0, "text");
  await paste(page, "Saved text");
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "write", {
      configurable: true,
      value: () =>
        new Promise((resolve) => {
          window.releaseClipboard = resolve;
        }),
    }),
  );
  await page.keyboard.press("Control+x");
  await page.waitForFunction(() => typeof window.releaseClipboard === "function");
  await page.evaluate(() => window.tableProof.schema("text", "formula"));
  await page.evaluate(() => window.releaseClipboard());
  await expect(page.getByText("1 cell was skipped", { exact: false })).toBeVisible();
  await grid(page).focus();
  await page.keyboard.press("Control+z");
  expect((await values(page))["page-0:text"]).toBe("Saved text");
  expect(await page.evaluate(() => window.tableProof.writes.length)).toBe(1);
});
