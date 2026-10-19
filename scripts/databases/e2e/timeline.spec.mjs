import { expect, test } from "@playwright/test";

const timeline = ".database-timeline-view";
const track = (id) => `${timeline} [data-gantt-row][data-gantt-row-id="${id}"]`;
const bar = (id) => `${track(id)} [data-slot="gantt-bar"]`;
const viewport = `${timeline} [data-slot="gantt-timeline-pane"] [data-slot="scroll-area-viewport"]`;
const treeViewport = `${timeline} [data-slot="gantt-tree-pane"] [data-slot="scroll-area-viewport"]`;

async function options(page, patch) {
  await page.evaluate((patch) => window.timelineProof.setOptions(patch), patch);
}
async function selectRow(page, index) {
  await page
    .locator(`${timeline} .database-timeline-sidebar-row[data-timeline-row-id="row-${index}"]`)
    .hover();
  const label =
    index === 0
      ? "Select A long timeline title that must stay single line even in a narrow name column"
      : `Select Task ${index}`;
  await page.locator(timeline).getByRole("checkbox", { name: label, exact: true }).click();
}
async function drag(page, locator, dx) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + dx, rect.y + rect.height / 2, { steps: 12 });
  await page.mouse.up();
}
async function startSidebarDrag(page, index = 0) {
  await page.locator(`${timeline} [data-timeline-row-id="row-${index}"]`).hover();
  const name = index === 0 ? /^Drag A long/ : `Drag Task ${index}`;
  const handle = await page
    .locator(timeline)
    .getByRole("button", { name, exact: index !== 0 })
    .boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 12, {
    steps: 3,
  });
  await expect(page.locator(`${timeline} .database-row-drag-overlay`)).toBeVisible();
}
async function groupFooter(page, name) {
  const id = await page
    .locator("[data-timeline-group-header]")
    .filter({ hasText: name })
    .getAttribute("data-timeline-group-header");
  return page.locator(`[data-timeline-group-footer=${JSON.stringify(id)}]`);
}
async function assertAligned(page) {
  const geometry = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".database-timeline-sidebar-row")];
    return rows.map((row) => {
      const other = document.querySelector(
        `[data-gantt-row][data-gantt-row-id="${row.dataset.timelineRowId}"]`,
      );
      const a = row.getBoundingClientRect(),
        b = other.getBoundingClientRect();
      return [a.height, b.height, Math.abs(a.top - b.top)];
    });
  });
  for (const [left, right, difference] of geometry) {
    expect(left).toBe(32);
    expect(right).toBe(32);
    expect(difference).toBeLessThanOrEqual(1);
  }
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/scripts/databases/e2e/timeline.html");
  await expect(page.locator(`${timeline} [data-slot=gantt-view]`)).toBeVisible();
  await expect(page.locator(`${timeline} .database-timeline-sidebar-row`)).toHaveCount(40);
  expect(errors).toEqual([]);
});

test("compact rows and outside controls match the table through page scrolling and grouping", async ({
  page,
}) => {
  await selectRow(page, 0);
  await assertAligned(page);
  const geometry = await page.evaluate(() => {
    const rect = (s) => document.querySelector(s).getBoundingClientRect();
    const table = rect("[data-proof=table]"),
      view = rect(".database-timeline-view");
    return {
      height: rect("[data-proof=table-row]").height,
      offsets: [".database-row-drag-handle", ".database-row-checkbox"].map((s) => [
        rect("[data-proof=table] " + s).x - table.x,
        rect(".database-timeline-view " + s).x - view.x,
      ]),
      paneWidth: rect("[data-slot=gantt-tree-pane]").width,
      rowWidth: rect(".database-timeline-sidebar-row").width,
    };
  });
  expect(geometry.height).toBe(32);
  expect(geometry.paneWidth).toBe(250);
  expect(geometry.rowWidth).toBe(250);
  const title = await page
    .locator(`${timeline} .database-timeline-sidebar-row .database-page-title`)
    .first()
    .evaluate((el) => ({
      client: el.clientWidth,
      content: el.scrollWidth,
      overflow: getComputedStyle(el).textOverflow,
    }));
  expect(title.content).toBeGreaterThan(title.client);
  expect(title.overflow).toBe("ellipsis");
  const todayHeaderIsUnobscured = await page
    .locator(`${timeline} [data-gantt-axis] [data-today]`)
    .evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return (
        document
          .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          ?.closest("[data-today]") === el
      );
    });
  expect(todayHeaderIsUnobscured).toBe(true);

  for (const [table, gantt] of geometry.offsets)
    expect(Math.abs(table - gantt)).toBeLessThanOrEqual(1);
  expect(geometry.offsets.map((pair) => pair[1])).toEqual([-56, -24]);
  await page.evaluate(() => window.scrollTo(0, 512));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(512);
  await expect.poll(() => page.locator(treeViewport).evaluate((el) => el.scrollTop)).toBe(0);
  await assertAligned(page);
  await expect(
    page.locator(timeline).getByRole("checkbox", { name: /^Select A long/ }),
  ).toHaveCount(0);
  await selectRow(page, 8);
  const centerError = await page
    .getByRole("checkbox", { name: "Select Task 8", exact: true })
    .evaluate((el) => {
      const row = document.querySelector('[data-timeline-row-id="row-8"]');
      const a = el.getBoundingClientRect(),
        b = row.getBoundingClientRect();
      return Math.abs(a.y + a.height / 2 - b.y - b.height / 2);
    });
  expect(centerError).toBeLessThanOrEqual(1);
  await options(page, { grouped: true });
  await expect(page.locator(`${timeline} .database-timeline-sidebar-name-header`)).toHaveCount(1);
  await expect(page.locator(`${timeline} [data-slot="gantt-tree-header"]`)).toHaveText("AaName");
  await assertAligned(page);
  await page.locator(`${timeline} .database-table-group-toggle`).first().click();
  await expect(page.locator(`${timeline} .database-timeline-sidebar-row`)).toHaveCount(20);
  await expect(page.locator(`${timeline} .database-timeline-sidebar-name-header`)).toHaveCount(1);
  await assertAligned(page);
});

test("the app page viewport owns scrolling and the timeline fills it after resizing", async ({
  page,
}) => {
  await options(page, { pageViewport: true, count: 3 });
  const pageViewport = page.locator("[data-page-scroll-viewport]");
  const chartBottom = () =>
    page.locator(timeline).evaluate((el) => Math.round(el.getBoundingClientRect().bottom));
  await expect.poll(chartBottom).toBe(900);
  await pageViewport.evaluate((el) => {
    el.style.height = "calc(100vh - 160px)";
  });
  await expect.poll(chartBottom).toBe(804);
  await options(page, { count: 40 });
  await page
    .locator(`${timeline} [data-slot="gantt-timeline-pane"]`)
    .hover({ position: { x: 200, y: 150 } });
  await page.mouse.wheel(0, 400);
  await expect.poll(() => pageViewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.locator(treeViewport).evaluate((el) => el.scrollTop)).toBe(0);
  await assertAligned(page);
});

test("selection actions float above the timeline without moving its header or tracks", async ({
  page,
}) => {
  await options(page, { pageViewport: true });
  const view = page.locator(timeline);
  const before = await view.boundingBox();
  const rowBefore = await page.locator(track("row-0")).boundingBox();
  await selectRow(page, 0);
  const toolbar = page.getByRole("toolbar", { name: "Selected row actions" });
  await expect(toolbar).toBeVisible();
  expect(await view.boundingBox()).toEqual(before);
  expect(await page.locator(track("row-0")).boundingBox()).toEqual(rowBefore);
  const floating = await toolbar.boundingBox();
  const section = await page.locator(".database-scroll-section").boundingBox();
  expect(floating.x).toBe(section.x);
  expect(floating.y + floating.height).toBe(section.y - 8);
  await assertAligned(page);
  await toolbar.getByRole("button", { name: "Clear selection of 1 rows" }).click();
  await expect(toolbar).toHaveCount(0);
});

test("checkboxes share bulk property editing, grouped undo and clear-selection actions", async ({
  page,
}) => {
  await selectRow(page, 0);
  await selectRow(page, 1);
  await expect(page.getByRole("toolbar", { name: "Selected row actions" })).toContainText(
    "2 selected",
  );
  await expect(page.locator(`${track("row-0")}[data-selected=true]`)).toHaveCount(1);
  await page.getByRole("button", { name: "More selected row actions" }).click();
  await page.getByRole("menuitem", { name: "Edit property", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Status", exact: true }).click();
  await page
    .locator("[data-row-property-panel]")
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.timelineProof.saves.filter((s) => s.propertyId === "status").length,
      ),
    )
    .toBe(2);
  expect(await page.evaluate(() => window.timelineProof.saves.map((s) => s.next))).toEqual([
    "Done",
    "Done",
  ]);
  await page.keyboard.press("Escape");
  await page.locator(`${timeline} [data-slot=gantt-nav-today]`).click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await expect.poll(() => page.evaluate(() => window.timelineProof.saves.length)).toBe(4);
  expect(
    await page.evaluate(() => window.timelineProof.saves.slice(-2).map((s) => s.next)),
  ).toEqual(["Open", "Open"]);
  await page.getByRole("button", { name: "More selected row actions" }).click();
  await page.evaluate(() => {
    window.clipboardWrites = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.clipboardWrites.push(text);
        },
      },
    });
  });
  await page.getByText("Copy links to all", { exact: true }).click();
  expect(await page.evaluate(() => window.clipboardWrites)).toEqual([
    "http://127.0.0.1:1499/p/page-0\nhttp://127.0.0.1:1499/p/page-1",
  ]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Clear selection of 2 rows" }).click();
  await expect(page.getByRole("toolbar")).toHaveCount(0);
});

test("bar movement and both resize edges save dates, support rollback, and respect read-only", async ({
  page,
}) => {
  await drag(page, page.locator(bar("row-0")), 64);
  await expect.poll(() => page.evaluate(() => window.timelineProof.saves.length)).toBe(1);
  expect(await page.evaluate(() => window.timelineProof.opened)).toEqual([]);
  const original = await page.evaluate(() => window.timelineProof.saves[0]);
  expect(original.previous).not.toEqual(original.next);
  await page.evaluate(() => window.timelineProof.rollback());
  await expect
    .poll(() => page.evaluate(() => window.timelineProof.readValues()["page-0:date"]))
    .toEqual(original.previous);
  for (const edge of ["start", "end"]) {
    await drag(
      page,
      page.locator(`${bar("row-0")} [data-edge=${edge}]`),
      edge === "start" ? -64 : 64,
    );
  }
  await expect.poll(() => page.evaluate(() => window.timelineProof.saves.length)).toBe(3);
  const count = await page.evaluate(() => window.timelineProof.saves.length);
  const rect = await page.locator(bar("row-0")).boundingBox();
  await page.mouse.move(rect.x + 40, rect.y + 12);
  await page.mouse.down();
  await page.mouse.move(rect.x + 140, rect.y + 12, { steps: 8 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await page.evaluate(() => window.timelineProof.saves.length)).toBe(count);
  await options(page, { editable: false });
  await expect(page.locator(`${timeline} .database-row-checkbox`)).toHaveCount(0);
  await drag(page, page.locator(bar("row-0")), 64);
  expect(await page.evaluate(() => window.timelineProof.saves.length)).toBe(count);
});

test("unscheduled rows, new pages, external drops and date setup remain usable", async ({
  page,
}) => {
  await page.locator(bar("row-0")).click();
  expect(await page.evaluate(() => window.timelineProof.opened)).toEqual(["page-0"]);
  const pane = await page.locator(`${timeline} [data-slot=gantt-timeline-pane]`).boundingBox();
  const row = await page.locator(track("row-1")).boundingBox();
  await page.mouse.click(pane.x + 200, row.y + 16);
  await expect(page.locator(bar("row-1"))).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.timelineProof.saves.length)).toBe(1);
  const saved = await page.evaluate(() => window.timelineProof.saves[0].next);
  expect((new Date(saved[1]) - new Date(saved[0])) / 86400000).toBe(5);
  await options(page, { count: 2 });
  await page.locator(timeline).getByRole("button", { name: "New page", exact: true }).click();
  await expect(page.locator(`${timeline} .database-timeline-sidebar-row`)).toHaveCount(3);
  const emptyTrack = await page.locator(track("row-1000")).boundingBox();
  await page.mouse.move(pane.x + 200, emptyTrack.y + 16);
  await page.mouse.down();
  await page.mouse.move(pane.x + 328, emptyTrack.y + 16, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(bar("row-1000"))).toHaveCount(1);
  // ReUI suppresses the click dispatched immediately after a completed gesture.
  await page.waitForTimeout(300);
  const creation = await page
    .locator(`${timeline} [data-gantt-row][data-gantt-resource="timeline:new-page-ungrouped"]`)
    .boundingBox();
  await page.mouse.click(pane.x + 300, creation.y + 16);
  await expect(page.locator(bar("row-1001"))).toHaveCount(1);

  const transfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.setData(
      "application/x-zilobase-database-page",
      JSON.stringify({ pageId: "external-page", title: "External page" }),
    );
    return transfer;
  });
  const target = await page.locator(track("row-0")).boundingBox();
  await page.locator(timeline).dispatchEvent("dragover", {
    dataTransfer: transfer,
    clientX: pane.x + 100,
    clientY: target.y + 2,
  });
  await page.locator(timeline).dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: pane.x + 100,
    clientY: target.y + 2,
  });
  await expect
    .poll(() => page.evaluate(() => window.timelineProof.commands.filter((c) => c.external).length))
    .toBe(1);
  await options(page, { dateEnabled: false });
  await expect(page.getByText("Choose a date property", { exact: true })).toBeVisible();
  await page.getByRole("combobox").filter({ hasText: "Choose a date property" }).click();
  await page.getByRole("option", { name: "Date", exact: true }).click();
  await expect(page.locator(`${timeline} [data-slot=gantt-view]`)).toBeVisible();
});

for (const grouped of [false, true]) {
  test(`draw schedules on existing items in ${grouped ? "grouped" : "ungrouped"} timelines`, async ({
    page,
  }) => {
    await options(page, { count: 4, grouped });
    const pane = await page.locator(`${timeline} [data-slot=gantt-timeline-pane]`).boundingBox();
    const existingBar = await page.locator(bar("row-0")).boundingBox();
    const freeLeft = existingBar.x - pane.x;
    const freeRight = pane.x + pane.width - existingBar.x - existingBar.width;
    const fromX = freeLeft >= freeRight ? pane.x + 24 : existingBar.x + existingBar.width + 24;
    const toX = fromX + Math.min(128, Math.max(freeLeft, freeRight) - 48);
    expect(toX - fromX).toBeGreaterThan(64);

    for (const index of [0, 1]) {
      const target = page.locator(track(`row-${index}`));
      const row = await target.boundingBox();
      await page.mouse.move(fromX, row.y + 16);
      await expect(target.locator('[data-slot="gantt-schedule-hint"]')).toBeVisible();
      await page.mouse.down();
      await page.mouse.move(toX, row.y + 16, { steps: 10 });
      await expect(target.locator('[data-slot="gantt-slot-draft"]')).toBeVisible();
      await page.mouse.up();
      await expect
        .poll(() => page.evaluate(() => window.timelineProof.saves.length))
        .toBe(index + 1);
      const save = await page.evaluate((index) => window.timelineProof.saves[index], index);
      expect(save.rowId).toBe(`row-${index}`);
      expect(save.propertyId).toBe("date");
      expect(save.next).not.toEqual(save.previous);
      expect(new Date(save.next[1]).getTime()).toBeGreaterThan(new Date(save.next[0]).getTime());
      await expect(target.locator('[data-slot="gantt-bar"]')).toHaveCount(1);
    }
    expect(await page.evaluate(() => window.timelineProof.opened)).toEqual([]);
    await expect(page.locator(`${timeline} .database-timeline-sidebar-row`)).toHaveCount(4);
    await assertAligned(page);

    // Rolling back a replacement restores the existing range, rather than adding a second bar.
    await page.evaluate(() => {
      window.timelineProof.saves.pop();
      window.timelineProof.rollback();
    });
    expect(await page.evaluate(() => window.timelineProof.readValues()["page-0:date"])).toEqual(
      await page.evaluate(() => window.timelineProof.saves[0].previous),
    );
    await expect(page.locator(bar("row-0"))).toHaveCount(1);
    await options(page, { editable: false });
    const readOnlyRow = await page.locator(track("row-0")).boundingBox();
    await page.mouse.move(fromX, readOnlyRow.y + 16);
    await expect(page.locator(`${timeline} [data-slot="gantt-schedule-hint"]`)).toHaveCount(0);
    await page.mouse.down();
    await page.mouse.move(toX, readOnlyRow.y + 16, { steps: 10 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.timelineProof.saves.length)).toBe(1);
    await expect(page.locator(`${timeline} [data-slot="gantt-slot-draft"]`)).toHaveCount(0);
  });
}

test("all scales, zoom, navigation, sidebar, themes and narrow layouts retain alignment", async ({
  page,
}) => {
  for (const scale of ["Day", "Week", "Month", "Quarter", "Year"]) {
    await page.getByRole("button", { name: "Select view", exact: true }).click();
    await page.getByRole("menuitem", { name: scale, exact: true }).click();
    await expect(page.locator(`${timeline} [data-slot=gantt-view]`)).toHaveAttribute(
      "data-scale",
      scale.toLowerCase(),
    );
    await assertAligned(page);
  }
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.locator(`${timeline} [data-slot=gantt-tree-pane]`)).toBeHidden();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.locator(`${timeline} [data-slot=gantt-tree-pane]`)).toBeVisible();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await assertAligned(page);
  await page.setViewportSize({ width: 640, height: 900 });
  await assertAligned(page);
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
});

for (const timezoneId of ["Asia/Kolkata", "America/New_York"]) {
  test.describe(`date-grid creation in ${timezoneId}`, () => {
    test.use({ timezoneId });
    test("dragging from either half of a day keeps the chosen dates and viewport", async ({
      page,
    }) => {
      await options(page, { count: 4, grouped: true, saveDelay: 350 });
      const slots = await page.locator(timeline).evaluate((el) => {
        const axis = el.querySelector("[data-gantt-axis]");
        const pane = el.querySelector('[data-slot="gantt-timeline-pane"]').getBoundingClientRect();
        const dateKey = (index) => {
          const day = new Date(Number(axis.dataset.ganttRangeStart));
          day.setDate(day.getDate() + index);
          return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
        };
        const units = [...axis.querySelector(":scope > .relative.flex").children]
          .map((unit, index) => {
            const rect = unit.getBoundingClientRect();
            return { x: rect.x, width: rect.width, date: dateKey(index), end: dateKey(index + 1) };
          })
          .filter((unit) => unit.x >= pane.x + 10 && unit.x + unit.width < pane.right - 10);
        return { first: units[0], last: units[2], axisX: axis.getBoundingClientRect().x };
      });
      for (const [index, reverse, fraction] of [
        [1, false, 0.75],
        [0, true, 0.25],
      ]) {
        const row = page.locator(track(`row-${index}`));
        const rect = await row.boundingBox();
        const first = reverse ? slots.last : slots.first;
        const last = reverse ? slots.first : slots.last;
        await page.mouse.move(first.x + first.width * fraction, rect.y + 16);
        await expect(row.locator('[data-slot="gantt-schedule-hint"]')).toBeVisible();
        await page.mouse.down();
        await page.mouse.move(last.x + last.width * fraction, rect.y + 16, { steps: 12 });
        const draft = await row.locator('[data-slot="gantt-slot-draft"]').boundingBox();
        expect(Math.abs(draft.x - slots.first.x)).toBeLessThanOrEqual(1);
        await page.mouse.up();
        await expect
          .poll(() => page.evaluate(() => window.timelineProof.saves.length))
          .toBe(index === 1 ? 1 : 2);
        expect(await page.evaluate(() => window.timelineProof.saves.at(-1).next)).toEqual([
          slots.first.date,
          slots.last.end,
        ]);
        const savedBar = await row.locator('[data-slot="gantt-bar"]').boundingBox();
        expect(Math.abs(savedBar.x - draft.x)).toBeLessThanOrEqual(1);
        expect(
          Math.abs(
            (await page
              .locator(`${timeline} [data-gantt-axis]`)
              .evaluate((el) => el.getBoundingClientRect().x)) - slots.axisX,
          ),
        ).toBeLessThanOrEqual(1);
      }
      await assertAligned(page);
    });
  });
}

test("large loaded windows keep row tracks aligned and rail controls bounded", async ({ page }) => {
  await options(page, { count: 1000 });
  await expect(page.locator(`${timeline} .database-timeline-sidebar-row`)).toHaveCount(1000);
  await page.evaluate(() => window.scrollTo(0, 16000));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(16000);
  await expect.poll(() => page.locator(treeViewport).evaluate((el) => el.scrollTop)).toBe(0);
  await selectRow(page, 500);
  await assertAligned(page);
  expect(await page.locator(`${timeline} .database-row-controls`).count()).toBeLessThan(30);
});

test("outside row handles retain internal movement and the sorted placement dialog", async ({
  page,
}) => {
  await options(page, { count: 4, sorted: true });
  const row = page.locator(
    `${timeline} .database-timeline-sidebar-row[data-timeline-row-id="row-0"]`,
  );
  await row.hover();
  const handle = page.locator(timeline).getByRole("button", { name: /^Drag A long/ });
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await handle.dispatchEvent("dragstart", {
    dataTransfer: transfer,
    clientX: 38,
    clientY: (await row.boundingBox()).y + 16,
  });
  const target = await page.locator(track("row-3")).boundingBox();
  await page
    .locator(timeline)
    .dispatchEvent("dragover", { dataTransfer: transfer, clientX: 200, clientY: target.y + 25 });
  await expect(page.locator(`${timeline} .database-row-drop-line`)).toBeVisible();
  await page
    .locator(timeline)
    .dispatchEvent("drop", { dataTransfer: transfer, clientX: 200, clientY: target.y + 25 });
  await expect(page.getByRole("alertdialog")).toContainText("Clear sorting to reorder?");
  expect(await page.evaluate(() => window.timelineProof.commands.length)).toBe(0);
  await page.getByRole("button", { name: "Clear sorting", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.timelineProof.commands.length)).toBe(1);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.locator(`${timeline} .database-row-drag-overlay`)).toHaveCount(0);
});

for (const grouped of [false, true]) {
  test(`the drop line spans the Name sidebar and date grid in ${grouped ? "grouped" : "ungrouped"} timelines`, async ({
    page,
  }) => {
    await options(page, { count: 4, grouped });
    await page.locator(`${timeline} [data-timeline-row-id="row-3"]`).hover();
    const handle = await page
      .locator(timeline)
      .getByRole("button", { name: "Drag Task 3", exact: true })
      .boundingBox();
    const target = await page.locator(`${timeline} [data-timeline-row-id="row-0"]`).boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 - 12, {
      steps: 3,
    });
    await page.mouse.move(target.x + 100, target.y + 8, { steps: 20 });
    // Entering a title can emit dragenter first; the existing controller uses dragover.
    await page.mouse.move(target.x + 101, target.y + 8);
    const line = page.locator(`${timeline} > .database-timeline-row-drop-line`);
    await expect(line).toBeVisible();
    const paint = await line.evaluate((el) => {
      const root = el.closest(".database-timeline-view");
      const sidebar = root.querySelector('[data-slot="gantt-tree-pane"]').getBoundingClientRect();
      const grid = root.querySelector('[data-slot="gantt-timeline-pane"]').getBoundingClientRect();
      const preview = root.querySelector(".database-row-drag-overlay");
      const rect = el.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      const previousLineEvents = el.style.pointerEvents;
      const previousPreviewEvents = preview.style.pointerEvents;
      // Hit-test both display-only layers so the test checks the actual paint
      // order across the entire sidebar, its divider, and the date grid.
      el.style.pointerEvents = "auto";
      preview.style.pointerEvents = "auto";
      const visible = [
        sidebar.left + 1,
        sidebar.left + sidebar.width / 2,
        sidebar.right - 1,
        grid.left + 1,
        grid.right - 1,
      ].map((x) => {
        const y = rect.top + 1;
        const top = document.elementsFromPoint(x, y)[0];
        return x >= previewRect.left &&
          x <= previewRect.right &&
          y >= previewRect.top &&
          y <= previewRect.bottom
          ? preview.contains(top)
          : top === el;
      });
      el.style.pointerEvents = previousLineEvents;
      preview.style.pointerEvents = previousPreviewEvents;
      return {
        zIndex: getComputedStyle(el).zIndex,
        previewZIndex: getComputedStyle(preview).zIndex,
        left: rect.left,
        right: rect.right,
        sidebarLeft: sidebar.left,
        gridRight: grid.right,
        visible,
      };
    });
    expect(paint.zIndex).toBe("65");
    expect(Number(paint.previewZIndex)).toBeGreaterThan(Number(paint.zIndex));
    expect(Math.abs(paint.left - paint.sidebarLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(paint.right - paint.gridRight)).toBeLessThanOrEqual(1);
    expect(paint.visible).toEqual([true, true, true, true, true]);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.timelineProof.commands.length)).toBe(1);
    expect(await page.evaluate(() => window.timelineProof.commands[0].command)).toMatchObject({
      rowId: "row-3",
      placement: { afterRowId: null, beforeRowId: "row-0" },
    });
    await expect(line).toHaveCount(0);
  });
}

for (const group of ["Open", "Done"]) {
  test(`grouped sidebar drops append above New page in the ${group} group`, async ({ page }) => {
    await options(page, { count: 6, grouped: true });
    await page.evaluate(() =>
      window.timelineProof.setStatuses({ 3: "Done", 4: "Done", 5: "Done" }),
    );
    await expect(
      page.locator("[data-timeline-group-header]").filter({ hasText: group }),
    ).toContainText("3");
    const footer = await groupFooter(page, group);
    const rect = await footer.boundingBox();
    await startSidebarDrag(page);
    await page.mouse.move(rect.x + 100, rect.y + 16, { steps: 20 });
    await page.mouse.move(rect.x + 101, rect.y + 16);
    const line = page.locator(`${timeline} .database-timeline-row-drop-line`);
    await expect(line).toBeVisible();
    await expect
      .poll(async () => Math.abs((await line.boundingBox()).y + 2 - rect.y))
      .toBeLessThanOrEqual(1);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.timelineProof.commands.length)).toBe(1);
    const command = await page.evaluate(() => window.timelineProof.commands[0].command);
    expect(command).toMatchObject({
      rowId: "row-0",
      placement:
        group === "Open"
          ? { afterRowId: "row-2", beforeRowId: "row-3" }
          : { afterRowId: "row-5", beforeRowId: null },
    });
    if (group === "Done") expect(command.valuesByPropertyId).toEqual({ status: "Done" });
    else expect(command.valuesByPropertyId).toBeUndefined();
    await expect(line).toHaveCount(0);
  });
}

for (const group of ["Open", "Done"]) {
  test(`the empty ${group} group accepts existing and external pages above New page`, async ({
    page,
  }) => {
    await options(page, { count: 3, grouped: true });
    if (group === "Open")
      await page.evaluate(() =>
        window.timelineProof.setStatuses({ 0: "Done", 1: "Done", 2: "Done" }),
      );
    const footer = await groupFooter(page, group);
    const rect = await footer.boundingBox();
    await startSidebarDrag(page);
    await page.mouse.move(rect.x + 100, rect.y + 16, { steps: 20 });
    await page.mouse.move(rect.x + 101, rect.y + 16);
    const line = page.locator(`${timeline} .database-timeline-row-drop-line`);
    await expect(line).toBeVisible();
    await expect
      .poll(async () => Math.abs((await line.boundingBox()).y + 2 - rect.y))
      .toBeLessThanOrEqual(1);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.timelineProof.commands.length)).toBe(1);
    expect(await page.evaluate(() => window.timelineProof.commands[0].command)).toMatchObject({
      rowId: "row-0",
      valuesByPropertyId: { status: group },
    });
    // The fixture records commands without changing the controlled records, so
    // this group is still empty for an external page drop through the date grid.
    const transfer = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.setData(
        "application/x-zilobase-database-page",
        JSON.stringify({ pageId: "imported-empty", title: "Imported page" }),
      );
      return data;
    });
    await page.locator(timeline).dispatchEvent("dragover", {
      dataTransfer: transfer,
      clientX: rect.x + 400,
      clientY: rect.y + 16,
    });
    await expect(line).toBeVisible();
    await expect
      .poll(async () => Math.abs((await line.boundingBox()).y + 2 - rect.y))
      .toBeLessThanOrEqual(1);
    await page.locator(timeline).dispatchEvent("drop", {
      dataTransfer: transfer,
      clientX: rect.x + 400,
      clientY: rect.y + 16,
    });
    expect(await page.evaluate(() => window.timelineProof.commands[1])).toMatchObject({
      external: { pageId: "imported-empty" },
      groupValue: group,
      position: 3,
    });
  });
}

test("New page is a flat table-style row and groups follow without a spacer", async ({ page }) => {
  await options(page, { count: 4, grouped: true });
  const tableCreate = page.locator('[data-proof="table"] .database-table-create');
  const create = page.locator(`${timeline} .database-table-create`).first();
  const style = (el) => {
    const css = getComputedStyle(el);
    return {
      padding: [css.paddingLeft, css.paddingRight],
      radius: css.borderRadius,
      background: css.backgroundColor,
      color: css.color,
      font: [css.fontSize, css.fontWeight],
      gap: css.gap,
      iconWidth: el.querySelector("svg").getBoundingClientRect().width,
    };
  };
  for (const dark of [false, true]) {
    await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), dark);
    await page.mouse.move(5, 5);
    expect(await create.evaluate(style)).toEqual(await tableCreate.evaluate(style));
    expect((await create.evaluate(style)).radius).toBe("0px");
    await tableCreate.hover();
    const hover = await tableCreate.evaluate(style);
    await create.hover();
    expect(await create.evaluate(style)).toEqual(hover);
  }
  const boundaries = await page
    .locator(`${timeline} [data-database-row-drop-footer]`)
    .evaluateAll((els) =>
      els.map((el) => {
        const sidebarRow = el.closest('[data-slot="gantt-row-group"]');
        const id = sidebarRow.dataset.ganttRowId;
        const track = [...document.querySelectorAll("[data-gantt-row]")].find(
          (row) => row.dataset.ganttRowId === id,
        );
        const rect = el.getBoundingClientRect();
        const nextGroup = sidebarRow.nextElementSibling;
        return {
          height: rect.height,
          alignment: Math.abs(rect.top - track.getBoundingClientRect().top),
          gap: nextGroup ? nextGroup.getBoundingClientRect().top - rect.bottom : 0,
        };
      }),
    );
  expect(boundaries).toHaveLength(2);
  for (const row of boundaries) {
    expect(row.height).toBe(32);
    expect(row.alignment).toBeLessThanOrEqual(1);
    expect(row.gap).toBe(0);
  }
  await create.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(`${timeline} .database-timeline-sidebar-row`)).toHaveCount(5);
  expect(await page.evaluate(() => window.timelineProof.readValues()["page-1000:status"])).toBe(
    "Open",
  );
  await assertAligned(page);
  await options(page, { editable: false });
  await expect(page.locator(`${timeline} .database-table-create`)).toHaveCount(0);
});

test("group title tracks are plain before hover while record tracks retain the daily grid", async ({
  page,
}) => {
  await options(page, { count: 4, grouped: true });
  await page.mouse.move(5, 5);
  const headers = page.locator(`${timeline} .database-timeline-group-track`);
  await expect(headers).toHaveCount(2);
  const initial = await headers.first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(initial).not.toBe("rgba(0, 0, 0, 0)");
  expect(initial).not.toBe("transparent");
  await headers.first().hover();
  expect(await headers.first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    initial,
  );
  const item = await page
    .locator(track("row-0"))
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(item).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  await assertAligned(page);
});

test("empty grouped timelines still accept a date-grid drop with the sidebar collapsed", async ({
  page,
}) => {
  await options(page, { count: 0, grouped: true });
  const footer = await groupFooter(page, "Done");
  const id = await footer.evaluate((el) => el.closest("[data-gantt-row-id]").dataset.ganttRowId);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  const target = await page
    .locator(`[data-gantt-row][data-gantt-row-id=${JSON.stringify(id)}]`)
    .boundingBox();
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.setData(
      "application/x-zilobase-database-page",
      JSON.stringify({ pageId: "collapsed-import", title: "Imported into Done" }),
    );
    return data;
  });
  await page.locator(timeline).dispatchEvent("dragover", {
    dataTransfer: transfer,
    clientX: target.x + 100,
    clientY: target.y + 16,
  });
  const line = page.locator(`${timeline} .database-timeline-row-drop-line`);
  await expect(line).toBeVisible();
  await expect
    .poll(async () => Math.abs((await line.boundingBox()).y + 2 - target.y))
    .toBeLessThanOrEqual(1);
  await page.locator(timeline).dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: target.x + 100,
    clientY: target.y + 16,
  });
  expect(await page.evaluate(() => window.timelineProof.commands[0])).toMatchObject({
    external: { pageId: "collapsed-import" },
    groupValue: "Done",
    position: 0,
  });
});

test("empty timelines keep New page and external placement feedback", async ({ page }) => {
  await options(page, { count: 0 });
  await expect(page.locator(`${timeline} .database-timeline-sidebar-row`)).toHaveCount(0);
  await expect(
    page.locator(timeline).getByRole("button", { name: "New page", exact: true }),
  ).toBeVisible();
  const transfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.setData(
      "application/x-zilobase-database-page",
      JSON.stringify({ pageId: "empty-drop", title: "First imported page" }),
    );
    return transfer;
  });
  const target = await page
    .locator(timeline)
    .getByRole("button", { name: "New page", exact: true })
    .boundingBox();
  await page
    .locator(timeline)
    .dispatchEvent("dragover", { dataTransfer: transfer, clientX: 200, clientY: target.y + 16 });
  await expect(page.locator(`${timeline} .database-row-drop-line`)).toBeVisible();
  await page
    .locator(timeline)
    .dispatchEvent("drop", { dataTransfer: transfer, clientX: 200, clientY: target.y + 16 });
  await expect(page.locator(`${timeline} .database-timeline-sidebar-row`)).toHaveCount(1);
});

test("embedded narrow pages preserve breakout, outside controls, and grouped creation", async ({
  page,
}) => {
  await options(page, { embedded: true, grouped: true, count: 2 });
  await expect
    .poll(() => page.locator(timeline).evaluate((el) => Math.round(el.getBoundingClientRect().x)))
    .toBe(80);
  await expect
    .poll(() =>
      page.locator(timeline).evaluate((el) => Math.round(el.getBoundingClientRect().width)),
    )
    .toBe(1120);
  await assertAligned(page);
  await selectRow(page, 0);
  const checkbox = page.locator(timeline).getByRole("checkbox", { name: /^Select A long/ });
  await expect(checkbox).toBeInViewport();
  await page
    .locator(timeline)
    .getByRole("button", { name: "New page", exact: true })
    .first()
    .click();
  expect(await page.evaluate(() => window.timelineProof.readValues()["page-1000:status"])).toBe(
    "Open",
  );
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect
    .poll(() => page.locator(timeline).evaluate((el) => Math.round(el.getBoundingClientRect().x)))
    .toBe(270);
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect
    .poll(() => page.locator(timeline).evaluate((el) => Math.round(el.getBoundingClientRect().x)))
    .toBe(80);
  await assertAligned(page);
});

test("embedded tables retain the full inline horizontal scroll viewport", async ({ page }) => {
  await options(page, { embedded: true, tablePreview: true, count: 2 });
  const scroll = page.locator('.database-table-scroll[role="grid"]');
  await expect(scroll).toBeVisible();
  for (const width of [900, 760]) {
    await page.locator('[data-editor-page-content="narrow"]').evaluate((el, width) => {
      el.style.maxWidth = `${width}px`;
    }, width);
    await expect
      .poll(() =>
        scroll.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const surface = el.closest("[data-editor-surface]").getBoundingClientRect();
          return Math.max(Math.abs(rect.left - surface.left), Math.abs(rect.width - surface.width));
        }),
      )
      .toBeLessThan(1);
    await scroll.evaluate((el) => {
      el.scrollLeft = 100;
    });
    await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  }
});

test("the timeline fills the remaining page without gaps or an internal vertical scroller", async ({
  page,
}) => {
  await options(page, { count: 3 });
  const measure = () =>
    page.evaluate(() => {
      const get = (selector) => document.querySelector(selector).getBoundingClientRect();
      const nav = get('[data-slot="gantt-nav"]');
      const tabs = get('[data-proof="view-tabs"]');
      const header = get('[data-slot="gantt-timeline-header"]');
      const chart = get(".database-timeline-view");
      return {
        navHeight: nav.height,
        gapAbove: nav.top - tabs.bottom,
        gapBelow: header.top - nav.bottom,
        pageBottom: chart.bottom,
        screenHeight: window.innerHeight,
        panes: [
          ...document.querySelectorAll(
            '.database-timeline-view [data-slot="scroll-area-viewport"]',
          ),
        ].map((el) => ({ client: el.clientHeight, content: el.scrollHeight })),
      };
    });
  await expect.poll(async () => Math.round((await measure()).pageBottom)).toBe(900);
  const layout = await measure();
  expect(layout.navHeight).toBe(40);
  expect(layout.gapAbove).toBeLessThanOrEqual(12);
  expect(layout.gapBelow).toBe(0);
  for (const pane of layout.panes) expect(pane.content).toBeLessThanOrEqual(pane.client + 1);
  await options(page, { count: 40 });
  const expanded = await measure();
  expect(expanded.pageBottom).toBeGreaterThan(expanded.screenHeight);
  for (const pane of expanded.panes) expect(pane.content).toBeLessThanOrEqual(pane.client + 1);
  await page
    .locator(' .database-timeline-view [data-slot="gantt-timeline-pane"]')
    .hover({ position: { x: 200, y: 150 } });
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(
    await page
      .locator(
        ' .database-timeline-view [data-slot="gantt-timeline-pane"] [data-slot="scroll-area-viewport"]',
      )
      .evaluate((el) => el.scrollTop),
  ).toBe(0);
  await assertAligned(page);
});

test("table and timeline share the popover title editor for mouse and keyboard activation", async ({
  page,
}) => {
  for (const surface of ["table", "timeline"]) {
    if (surface === "table")
      await page.getByRole("button", { name: "Show table", exact: true }).click();
    else await page.getByRole("button", { name: "Show timeline", exact: true }).click();
    const root =
      surface === "table"
        ? page.locator(".database-table-wrap").last()
        : page.locator(".database-timeline-sidebar-grid");
    const keyboardTarget = surface === "table" ? root.getByRole("grid") : root;
    const title = root.locator('tr[data-database-row-id="row-0"] .database-page-title-button');
    await title.dblclick();
    await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toBeVisible();
    await expect(page.locator('[data-slot="data-grid-cell-editor"]')).toHaveCount(0);
    await page.getByRole("textbox", { name: "Page title", exact: true }).press("Escape");
    await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toHaveCount(0);
    // Plain clicks edit immediately. Navigate to the first cell from the
    // grid container so F2 and typing exercise keyboard activation directly.
    await keyboardTarget.focus();
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("F2");
    await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Page title", exact: true }).press("Escape");
    await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toHaveCount(0);
    await keyboardTarget.focus();
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("z");
    await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toHaveValue("z");
    await expect(page.locator('[data-slot="data-grid-cell-editor"]')).toHaveCount(0);
    await page.getByRole("textbox", { name: "Page title", exact: true }).press("Escape");
    await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toHaveCount(0);
  }
  await assertAligned(page);
});
