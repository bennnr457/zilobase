import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/scripts/databases/e2e/index.html");
  await expect(page.locator('[data-row="a"]')).toBeVisible();
});

test("native Kanban drag remains projected through delayed save and stale refresh", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .locator('[data-row="a"]')
    .dragTo(page.locator('[data-column="Done"]'), { targetPosition: { x: 100, y: 100 } });
  await expect(page.locator('[data-column="Done"] [data-row="a"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.board.requests.length)).toBe(1);
  const command = await page.evaluate(() => window.board.requests[0].command);
  expect(command.type).toBe("row.change");
  expect(command.valuesByPropertyId).toEqual({ status: "Done" });
  expect(command.placement).toBeDefined();
  await page.evaluate(() =>
    window.board.refresh(
      ["a", "b", "c"],
      { "a:status": "Todo", "b:status": "Done", "c:status": "Done" },
      1,
    ),
  );
  await expect(page.locator('[data-column="Done"] [data-row="a"]')).toBeVisible();
  await page.evaluate(() => window.board.requests[0].resolve(2));
  await expect(page.locator('[data-column="Done"] [data-row="a"]')).toBeVisible();
  await page.evaluate(() =>
    window.board.refresh(window.board.read().order, window.board.read().values, 2),
  );
  await expect.poll(() => page.evaluate(() => window.board.read().pending)).toBe(false);
  expect(errors).toEqual([]);
});

test("mounted table and Kanban share confirmed query identity while settings preview immediately", async ({
  page,
}) => {
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.values(window.queries.output).every((view) => view.status === "success"),
      ),
    )
    .toBe(true);
  const initial = await page.evaluate(() => window.queries.output.table.hash);
  await page.evaluate(() => window.queries.edit());
  await expect
    .poll(() => page.evaluate(() => window.queries.output.table.config))
    .toEqual({ sorts: [{ column: "name", direction: "descending" }] });
  expect(await page.evaluate(() => window.queries.output.table.hash)).toBe(initial);
  expect(await page.evaluate(() => window.queries.rawConfig())).toEqual({});
  await page.evaluate(() => window.queries.confirm());
  await expect.poll(() => page.evaluate(() => window.queries.output.table.hash)).not.toBe(initial);
  expect(await page.evaluate(() => window.queries.output.kanban.hash)).toBe(initial);
});

test("browser demo receipts survive replay and refresh without any write request", async ({
  page,
}) => {
  const writes = [];
  page.on("request", (request) => {
    if (request.method() === "POST") writes.push(request.url());
  });
  const result = await page.evaluate(() => {
    const runtime = new window.DemoDatabaseRuntime(() => new Error("guarded"));
    const { bootstrap, window: records } = window.demoDatabaseFixture();
    const url = (path) => new URL(path, "https://demo.localhost");
    runtime.capture(url("/databases/demo-db/bootstrap"), bootstrap);
    runtime.capture(url("/databases/demo-db/data-sources/demo-source/records"), records);
    const target = url("/databases/demo-db/data-sources/demo-source/commands");
    const command = {
      protocolVersion: 2,
      commandId: "browser-move",
      command: {
        type: "row.change",
        rowId: "demo-row",
        placement: { afterRowId: "other-row", beforeRowId: null },
      },
    };
    const ack = runtime.command(target, command);
    const replay = runtime.command(target, command);
    const read = runtime.read(
      url(
        `/databases/demo-db/data-sources/demo-source/records?viewId=table&expectedQueryHash=${records.queryHash}`,
      ),
    );
    return { ack, replay, order: read.records.map(({ id }) => id) };
  });
  expect(result.replay).toEqual(result.ack);
  expect(result.ack.sourceVersions["demo-source"]).toBe(8);
  expect(result.order).toEqual(["other-row", "demo-row"]);
  expect(writes).toEqual([]);
});

test("same-column reorder submits placement without changing status", async ({ page }) => {
  await page.locator('[data-row="c"]').dragTo(page.locator('[data-row="b"]'), {
    targetPosition: { x: 50, y: 1 },
  });
  await expect.poll(() => page.evaluate(() => window.board.requests.length)).toBe(1);
  const command = await page.evaluate(() => window.board.requests[0].command);
  expect(command.type).toBe("row.change");
  expect(command.placement).toEqual({ afterRowId: "a", beforeRowId: "b" });
  expect(command.valuesByPropertyId).toBeUndefined();
});

test("sorted moves require confirmation, support cancellation, and retain one atomic move", async ({
  page,
}) => {
  await page.evaluate(() => window.board.setSorted());
  await page.locator('[data-row="a"]').dragTo(page.locator('[data-column="Done"]'));
  await expect.poll(() => page.evaluate(() => window.board.hasSortConfirmation())).toBe(true);
  expect(await page.evaluate(() => window.board.requests.length)).toBe(0);
  await page.evaluate(() => window.board.cancel());
  await expect(page.locator('[data-column="Todo"] [data-row="a"]')).toBeVisible();
  await page.locator('[data-row="a"]').dragTo(page.locator('[data-column="Done"]'));
  await page.evaluate(() => window.board.confirm());
  await expect.poll(() => page.evaluate(() => window.board.requests.length)).toBe(1);
  const command = await page.evaluate(() => window.board.requests[0].command);
  expect(command.type).toBe("row.change");
  expect(command.clearSortViewId).toBe("view-1");
  expect(command.valuesByPropertyId).toEqual({ status: "Done" });
  expect(command.placement).toBeDefined();
});

test("rapid repeated moves project the latest destination before earlier acknowledgements", async ({
  page,
}) => {
  await page.locator('[data-row="a"]').dragTo(page.locator('[data-column="Done"]'));
  await expect(page.locator('[data-column="Done"] [data-row="a"]')).toBeVisible();
  await page.locator('[data-row="a"]').dragTo(page.locator('[data-column="Todo"]'));
  await expect(page.locator('[data-column="Todo"] [data-row="a"]')).toBeVisible();
  await page.evaluate(() => window.board.requests[0].resolve(2));
  await expect.poll(() => page.evaluate(() => window.board.requests.length)).toBe(2);
  await expect(page.locator('[data-column="Todo"] [data-row="a"]')).toBeVisible();
  await page.evaluate(() => window.board.requests[1].resolve(3));
  expect(
    await page.evaluate(() => window.board.requests.map(({ command }) => command.type)),
  ).toEqual(["row.change", "row.change"]);
});

test("unrelated database and presence publications preserve mounted record models and unchanged rows", async ({
  page,
}) => {
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.values(window.queries.output).every((view) => view.status === "success"),
      ),
    )
    .toBe(true);
  // Allow the query scheduler to deliver the settled initial publication.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const before = await page.evaluate(() => structuredClone(window.queries.counts));
  await page.evaluate(() => window.queries.presence());
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  expect(await page.evaluate(() => window.queries.counts)).toEqual(before);
  await page.evaluate(() => window.queries.publishOther());
  await expect(page.locator('[data-query-row="other-first"]')).toHaveText("other-first-2");
  const after = await page.evaluate(() => window.queries.counts);
  expect(after.models.table).toBe(before.models.table);
  expect(after.models.kanban).toBe(before.models.kanban);
  expect(after.rows["other-second"]).toBe(before.rows["other-second"]);
});
