import { expect, test } from "@playwright/test";

const root = ".database-calendar-view";
const cells = `${root} [data-slot=event-calendar-month-cell]`;
const chip = (id) => `${root} [data-slot=event-calendar-event]:has([data-calendar-record="${id}"])`;
const options = (page, patch) =>
  page.evaluate((patch) => window.timelineProof.setOptions(patch), patch);
async function dayValue(cell) {
  return cell.evaluate((el) => {
    const d = new Date(Number(el.dataset.ecDay));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
}
async function draw(page, first, last) {
  const a = await first.boundingBox(),
    b = await last.boundingBox();
  await page.mouse.move(a.x + a.width * 0.75, a.y + a.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.75, b.y + b.height * 0.7, { steps: 12 });
}
async function mode(page, name) {
  await page.getByRole("button", { name: "Select view", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/scripts/databases/e2e/calendar.html");
  await expect(page.locator(cells)).toHaveCount(42);
});

test("calendars start with name only and properties appear when explicitly enabled", async ({
  page,
}) => {
  await expect(page.locator(`${root} [data-calendar-property]`)).toHaveCount(0);
  const card = page.locator(chip("row-0")).first();
  const initialHeight = await card.evaluate((el) => el.getBoundingClientRect().height);
  await options(page, { showSettings: true });
  await page.getByRole("button", { name: "Open view settings" }).click();
  await page.getByText("Property visibility", { exact: true }).click();
  const status = page.getByRole("menuitem", { name: "Status", exact: true });
  const date = page.getByRole("menuitem", { name: "Date", exact: true });
  await expect(status).toHaveAttribute("aria-pressed", "false");
  await expect(date).toHaveAttribute("aria-pressed", "false");
  await status.click();
  await expect(status).toHaveAttribute("aria-pressed", "true");
  await expect(card.locator("[data-calendar-property=status]")).toHaveText("Open");
  await expect(page.locator(`${root} [data-calendar-property=date]`)).toHaveCount(0);
  await expect
    .poll(() => card.evaluate((el) => el.getBoundingClientRect().height))
    .toBeGreaterThan(initialHeight);
});

test("property visibility updates every multi-week card and grows or shrinks the week rows", async ({
  page,
}) => {
  await options(page, { showSettings: true, columns: ["date-list", "status-list"] });
  const cards = page.locator(chip("row-0"));
  const heights = () =>
    cards.evaluateAll((elements) =>
      elements.map((el) => ({
        card: el.getBoundingClientRect().height,
        week: el.closest("[data-slot=event-calendar-month-row]").getBoundingClientRect().height,
      })),
    );
  await expect(cards).toHaveCount(2);
  const expanded = await heights();
  await page.getByRole("button", { name: "Open view settings" }).click();
  await page.getByText("Property visibility", { exact: true }).click();
  const search = page.getByRole("textbox", { name: "Search for a property", exact: true });
  await search.fill("status");
  await expect(page.getByRole("menuitem", { name: "Date", exact: true })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Status", exact: true }).click();
  await expect(page.locator(`${root} [data-calendar-property=status]`)).toHaveCount(0);
  await expect
    .poll(async () =>
      (await heights()).every(
        (size, index) => size.card < expanded[index].card && size.week < expanded[index].week,
      ),
    )
    .toBe(true);
  await page.getByRole("menuitem", { name: "Status", exact: true }).click();
  await expect(cards.first().locator("[data-calendar-property=status]")).toHaveText("Open");
  await expect.poll(heights).toEqual(expanded);
  await search.fill("");
  await page.getByRole("menuitem", { name: "Status", exact: true }).click();
  await page.getByRole("menuitem", { name: "Date", exact: true }).click();
  await expect(page.locator(`${root} [data-calendar-property]`)).toHaveCount(0);
  await expect(cards).toHaveCount(2);
});

test("single-day cards, overflow and agenda use the visible properties", async ({ page }) => {
  await options(page, { columns: ["date-list", "status-list"] });
  const date = await dayValue(page.locator(cells).nth(2));
  await page.evaluate((date) => window.timelineProof.setDates({ 0: date }), date);
  const single = page.locator(chip("row-0"));
  await expect(single).toHaveCount(1);
  await expect(single.locator("[data-calendar-property]")).toHaveCount(2);
  await expect(single.locator("button, a, input")).toHaveCount(0);
  const tall = await single.evaluate((el) => el.getBoundingClientRect().height);
  await options(page, { columns: [] });
  await expect
    .poll(() => single.evaluate((el) => el.getBoundingClientRect().height))
    .toBeLessThan(tall);
  await options(page, { columns: ["status-list"], count: 50 });
  await page.locator(`${root} [data-slot=event-calendar-more]`).first().click();
  await expect(
    page.locator("[data-slot=event-calendar-more-popover] [data-calendar-property=status]").first(),
  ).toHaveText("Open");
  await page.keyboard.press("Escape");
  await mode(page, "Agenda");
  await expect(page.locator(`${root} [data-calendar-property=status]`).first()).toHaveText("Open");
  await expect(page.locator(`${root} [data-calendar-property=date]`)).toHaveCount(0);
});

test("calendar conditional color settings show calendar sample cards", async ({ page }) => {
  await options(page, { showSettings: true });
  await page.getByRole("button", { name: "Open view settings" }).click();
  await page.getByText("Conditional color", { exact: true }).click();
  const preview = page.getByLabel("Calendar conditional color preview");
  await expect(preview).toBeVisible();
  await expect(preview.getByText("User research on the onboarding flow")).toBeVisible();
  await expect(preview.getByText("Support", { exact: true })).toHaveCount(2);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect(preview).toBeVisible();
});

test("calendar rules color matching events and show one color swatch without table targets", async ({
  page,
}) => {
  await options(page, { showSettings: true });
  const card = page.locator(chip("row-0")).first();
  const background = () => card.evaluate((el) => getComputedStyle(el).backgroundColor);
  const initialBackground = await background();
  await page.evaluate(() =>
    window.timelineProof.setConditionalColors([
      {
        id: "rule",
        color: "red",
        applyTo: "property",
        filter: { id: "rule-filter", propertyId: "status-list", operator: "is", values: ["Open"] },
      },
    ]),
  );
  await expect(card).toHaveAttribute(
    "style",
    /--ec-event-color: var\(--zb-color-palette-text-red\)/,
  );
  await expect.poll(background).not.toBe(initialBackground);
  await page.getByRole("button", { name: "Open view settings" }).click();
  await page.getByText("Conditional color", { exact: true }).click();
  const color = page.getByRole("combobox", { name: "Conditional color", exact: true });
  await expect(color.locator("[data-conditional-color-swatch]")).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Apply color to" })).toHaveCount(0);
  await expect(page.getByText("Entire row", { exact: true })).toHaveCount(0);
  await color.click();
  await page.getByRole("option", { name: "Purple", exact: true }).click();
  await expect(color.locator("[data-conditional-color-swatch]")).toHaveCount(1);
  await expect(card).toHaveAttribute(
    "style",
    /--ec-event-color: var\(--zb-color-palette-text-purple\)/,
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.timelineProof.setStatuses({ 0: "Done" }));
  await expect(card).not.toHaveAttribute("style", /--zb-color-palette-text-purple/);
  await page.evaluate(() => {
    window.timelineProof.setStatuses({ 0: "" });
    window.timelineProof.setConditionalColors([
      {
        id: "default-status-rule",
        color: "orange",
        applyTo: "row",
        filter: {
          id: "default-status-filter",
          propertyId: "status-list",
          operator: "is",
          values: ["Not started"],
        },
      },
    ]);
  });
  await expect(card).toHaveAttribute(
    "style",
    /--ec-event-color: var\(--zb-color-palette-text-orange\)/,
  );
  for (const name of ["Week", "Day", "Agenda"]) {
    await mode(page, name);
    await expect(page.locator(chip("row-0")).first()).toHaveAttribute(
      "style",
      /--ec-event-color: var\(--zb-color-palette-text-orange\)/,
    );
  }
});

test("checkboxes, buttons and links are static previews and the card opens the record", async ({
  page,
}) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await options(page, {
    previewControls: true,
    columns: ["checkbox-list", "button-list", "url-list"],
    count: 2,
  });
  const card = page.locator(chip("row-0")).first();
  await expect(card.locator("[data-calendar-property]")).toHaveCount(3);
  await expect(card.locator("button, input, a, [tabindex]")).toHaveCount(0);
  await card.click();
  expect(await page.evaluate(() => window.timelineProof.opened)).toEqual(["page-0"]);
  expect(
    errors.filter((error) => error.includes("cannot") || error.includes("descendant")),
  ).toEqual([]);
});

test("date clicks create one dated record and request the existing page dialog with a blank focused title", async ({
  page,
}) => {
  const target = page.locator(cells).nth(2);
  const date = await dayValue(target);
  await target.hover();
  await expect(target.locator("[data-slot=event-calendar-day-add]")).toBeVisible();
  await target.click({ position: { x: 30, y: 60 } });
  await expect.poll(() => page.evaluate(() => window.timelineProof.created.length)).toBe(1);
  expect(await page.evaluate(() => window.timelineProof.created[0].next)).toBe(date);
  expect(await page.evaluate(() => window.timelineProof.opened)).toEqual(["page-1000"]);
  expect(await page.evaluate(() => window.timelineProof.openedOptions[0])).toEqual({
    databaseId: "host",
    presentation: "dialog",
    focusTitle: true,
  });
  await expect(page.locator(chip("row-1000"))).toHaveCount(1);
});

for (const reverse of [false, true])
  test(`range creation ${reverse ? "backward" : "forward"} survives slow application work without a release click`, async ({
    page,
  }) => {
    await options(page, { saveDelay: 350 });
    const first = page.locator(cells).nth(7),
      last = page.locator(cells).nth(9);
    const dates = [await dayValue(first), await dayValue(last)];
    await draw(page, reverse ? last : first, reverse ? first : last);
    await expect(
      page.locator(`${root} [data-slot=event-calendar-slot-draft]`).first(),
    ).toBeVisible();
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.timelineProof.created.length)).toBe(1);
    expect(await page.evaluate(() => window.timelineProof.created[0].next)).toEqual(dates);
    expect(await page.evaluate(() => window.timelineProof.opened.length)).toBe(1);
  });

test("cancel, failed creation, and late results do not open phantom pages", async ({ page }) => {
  await draw(page, page.locator(cells).nth(7), page.locator(cells).nth(9));
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await page.evaluate(() => window.timelineProof.created)).toEqual([]);
  await options(page, { failCreate: true });
  await page
    .locator(cells)
    .nth(2)
    .click({ position: { x: 30, y: 60 } });
  await expect(page.getByText("Creation failed", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.timelineProof.opened)).toEqual([]);
  await options(page, { failCreate: false, createDelay: 500 });
  await page
    .locator(cells)
    .nth(2)
    .click({ position: { x: 30, y: 60 } });
  await options(page, { viewScope: "different-view" });
  await expect.poll(() => page.evaluate(() => window.timelineProof.created.length)).toBe(1);
  expect(await page.evaluate(() => window.timelineProof.opened)).toEqual([]);
});

test("Unscheduled drops update the existing record and open its dialog", async ({ page }) => {
  const source = page.locator('[data-calendar-unscheduled-row="row-1"]');
  await expect(source).toHaveCount(0);
  await page.getByRole("button", { name: "Unscheduled (1)", exact: true }).click();
  await expect(source).toBeVisible();
  const target = page.locator(cells).nth(4),
    date = await dayValue(target);
  await source.dragTo(target, { targetPosition: { x: 30, y: 60 } });
  await expect.poll(() => page.evaluate(() => window.timelineProof.saves.length)).toBe(1);
  expect(await page.evaluate(() => window.timelineProof.saves[0])).toMatchObject({
    rowId: "row-1",
    next: date,
  });
  await expect(source).toHaveCount(0);
  expect(await page.evaluate(() => window.timelineProof.created)).toEqual([]);
  expect(await page.evaluate(() => window.timelineProof.openedOptions[0])).toMatchObject({
    presentation: "dialog",
  });
});

test("all four modes, navigation, themes and narrow layouts remain usable", async ({ page }) => {
  for (const name of ["Week", "Day", "Agenda", "Month"]) {
    await mode(page, name);
    await expect(page.locator(`${root} [data-slot=event-calendar-content]`)).toHaveAttribute(
      "data-view",
      name.toLowerCase(),
    );
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.setViewportSize({ width: 620, height: 800 });
  expect(
    await page.locator(root).evaluate((el) => el.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(620);
  await page
    .locator(root)
    .getByRole("button", { name: /Unscheduled/ })
    .click();
  await expect(page.getByRole("dialog", { name: "Unscheduled records" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-calendar-unscheduled]")).toHaveCount(0);
});

test("timed slots create one-hour values and existing events move, resize and reconcile rollback", async ({
  page,
}) => {
  await options(page, { count: 2 });
  await mode(page, "Day");
  const column = page.locator(`${root} [data-slot=event-calendar-day-column]`);
  await column.evaluate((el) => (el.closest("[data-slot=scroll-area-viewport]").scrollTop = 500));
  const area = await column.boundingBox();
  await page.mouse.click(area.x + area.width * 0.7, area.y + 600);
  await expect.poll(() => page.evaluate(() => window.timelineProof.created.length)).toBe(1);
  const saved = await page.evaluate(() => window.timelineProof.created[0].next);
  expect((new Date(saved[1]) - new Date(saved[0])) / 60000).toBe(60);
  const bar = page.locator(chip("row-1000"));
  const rect = await bar.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2 + 64, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.timelineProof.saves.length)).toBe(1);
  await page.evaluate(() => window.timelineProof.rollback());
  await expect
    .poll(() => page.evaluate(() => window.timelineProof.readValues()["page-1000:date"]))
    .toEqual(saved);
  for (const edge of ["start", "end"]) {
    const handle = bar.locator(`[data-slot=event-calendar-resize-handle][data-edge=${edge}]`);
    const r = await handle.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2 + (edge === "end" ? 32 : -32), {
      steps: 10,
    });
    await page.mouse.up();
  }
  await expect.poll(() => page.evaluate(() => window.timelineProof.saves.length)).toBe(3);
});

test("read-only calendars open records but cannot create, move, resize or schedule", async ({
  page,
}) => {
  await options(page, { editable: false });
  await expect(page.locator(`${root} [data-slot=event-calendar-day-add]`)).toHaveCount(0);
  await page
    .locator(cells)
    .nth(2)
    .click({ position: { x: 30, y: 60 } });
  expect(await page.evaluate(() => window.timelineProof.created)).toEqual([]);
  await page.locator(chip("row-0")).first().click();
  expect(await page.evaluate(() => window.timelineProof.openedOptions[0])).toMatchObject({
    presentation: "dialog",
  });
  await expect(page.locator(`${root} [data-slot=event-calendar-resize-handle]`)).toHaveCount(0);
  await page.getByRole("button", { name: "Unscheduled (1)", exact: true }).click();
  await expect(page.locator('[data-calendar-unscheduled-row="row-1"]')).toHaveAttribute(
    "draggable",
    "false",
  );
});

test("missing date properties show setup and busy dates expose overflow without hiding records", async ({
  page,
}) => {
  await options(page, { count: 50 });
  await expect(page.locator(`${root} [data-slot=event-calendar-more]`).first()).toBeVisible();
  await page.locator(`${root} [data-slot=event-calendar-more]`).first().click();
  await expect(page.locator("[data-slot=event-calendar-more-popover]")).toBeVisible();
  await page.keyboard.press("Escape");
  await options(page, { dateEnabled: false });
  await expect(page.getByText("Calendar needs a date property", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Calendar date property" }).click();
  await page.getByRole("option", { name: "Date", exact: true }).click();
  await expect(page.locator(cells)).toHaveCount(42);
});

for (const timezoneId of ["Asia/Kolkata", "America/New_York"]) {
  test.describe(`calendar civil dates in ${timezoneId}`, () => {
    test.use({ timezoneId });
    test("drawing a range keeps its day anchors and viewport", async ({ page }) => {
      const first = page.locator(cells).nth(9),
        last = page.locator(cells).nth(11);
      const dates = [await dayValue(first), await dayValue(last)];
      const top = await first.evaluate((el) => el.getBoundingClientRect().top);
      await draw(page, first, last);
      await page.mouse.up();
      await expect.poll(() => page.evaluate(() => window.timelineProof.created.length)).toBe(1);
      expect(await page.evaluate(() => window.timelineProof.created[0].next)).toEqual(dates);
      expect(
        Math.abs((await first.evaluate((el) => el.getBoundingClientRect().top)) - top),
      ).toBeLessThan(1);
    });
  });
}

test("a large loaded window remains usable in an embedded narrow calendar", async ({ page }) => {
  await options(page, { count: 1000, embedded: true, pageViewport: true });
  await expect(page.locator(`${root} [data-slot=event-calendar-more]`).first()).toBeVisible();
  await page.locator(`${root} [data-slot=event-calendar-more]`).first().click();
  await expect(page.locator("[data-slot=event-calendar-more-popover]")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 620, height: 800 });
  expect(
    await page.locator(root).evaluate((el) => el.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(620);
});

test("Week range creation spans day columns in either direction", async ({ page }) => {
  await mode(page, "Week");
  const columns = page.locator(`${root} [data-slot=event-calendar-day-column]`);
  await columns
    .first()
    .evaluate((el) => (el.closest("[data-slot=scroll-area-viewport]").scrollTop = 400));
  for (const reverse of [false, true]) {
    const a = await columns.nth(1).boundingBox(),
      b = await columns.nth(3).boundingBox();
    const from = { x: a.x + a.width * 0.8, y: a.y + 600 },
      to = { x: b.x + b.width * 0.8, y: b.y + 660 };
    await page.mouse.move((reverse ? to : from).x, (reverse ? to : from).y);
    await page.mouse.down();
    await page.mouse.move((reverse ? from : to).x, (reverse ? from : to).y, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate(() => window.timelineProof.created.length))
      .toBe(reverse ? 2 : 1);
    if (!reverse) {
      await page.evaluate(() => window.timelineProof.setDates({ 1000: "" }));
      await expect(page.locator(chip("row-1000"))).toHaveCount(0);
    }
  }
  const created = await page.evaluate(() => window.timelineProof.created.map((c) => c.next));
  expect(created[0]).toEqual(created[1]);
  expect((new Date(created[0][1]) - new Date(created[0][0])) / 3600000).toBeGreaterThan(48);
});
