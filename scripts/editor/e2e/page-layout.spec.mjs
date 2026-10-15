import { test, expect } from "@playwright/test";

const fixture = "/scripts/editor/e2e/page-layout.html";

async function settlePresentation(locator) {
  await locator.evaluate(async (node) => {
    node.getBoundingClientRect();
    await Promise.allSettled(
      node.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
}

test("page frames own one header and one body viewport; promotion retains the draft and instance", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Direct pane", exact: true }).click();
  const side = page.locator("[data-page-side-pane-panel] [data-page-layout]");
  await expect(side).toHaveAttribute("data-page-layout", "pane");
  for (const frame of await page.locator("[data-page-layout]").all()) {
    await expect(frame.locator("[data-page-header]")).toHaveCount(1);
    await expect(frame.locator("[data-page-scroll-viewport]")).toHaveCount(1);
  }
  await side.getByLabel("Draft child").fill("Unsaved draft");
  const instance = await side
    .locator("[data-editor-instance]")
    .getAttribute("data-editor-instance");
  const viewport = side.locator("[data-page-scroll-viewport]");
  const top = await side
    .locator("[data-page-header]")
    .evaluate((node) => node.getBoundingClientRect().top);
  await viewport.evaluate((node) => {
    node.scrollTop = 150;
  });
  await expect
    .poll(() =>
      side.locator("[data-page-header]").evaluate((node) => node.getBoundingClientRect().top),
    )
    .toBe(top);
  await side.getByRole("link", { name: "Open as full page", exact: true }).click();
  await expect(side).toHaveAttribute("data-page-layout", "main");
  await expect(side.getByLabel("Draft child")).toHaveValue("Unsaved draft");
  await expect(side.locator("[data-editor-instance]")).toHaveAttribute(
    "data-editor-instance",
    instance,
  );
  await expect.poll(() => page.evaluate(() => window.pageLayoutFixture.mounts.child)).toBe(1);
  await expect.poll(() => page.evaluate(() => location.pathname)).toBe("/p/child");
});

test("desktop dialog contains its page header and closes with focus restoration", async ({
  page,
}) => {
  await page.goto(fixture);
  const trigger = page.getByRole("button", { name: "Direct dialog", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('[data-page-layout="dialog"]')).toHaveCount(1);
  await expect(dialog.locator("[data-page-header]")).toHaveCount(1);
  await expect(dialog.locator("[data-page-scroll-viewport]")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

for (const command of ["Direct pane", "Direct dialog", "Open child"]) {
  test(`mobile ${command} opens main without an embedded host`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(fixture);
    await page.getByRole("button", { name: command, exact: true }).click();
    await expect(page.locator("[data-fixture-path]")).toHaveText("/p/child");
    await expect(page.locator("[data-page-side-pane-panel], [data-page-dialog-panel]")).toHaveCount(
      0,
    );
    await expect(page.locator('[data-page-layout="main"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Open current", exact: true }).click();
    await expect(page.locator("[data-fixture-path]")).toHaveText("/p/child");
  });
}

test("mobile deep links and a desktop dialog resized to mobile replace the main route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${fixture}?target=${encodeURIComponent("/p/main?p=child")}`);
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/child");
  await expect(page.locator("[data-page-side-pane-panel], [data-page-dialog-panel]")).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(fixture);
  await page.getByRole("button", { name: "Direct dialog", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/child");
  await expect(page.locator("[data-page-side-pane-panel], [data-page-dialog-panel]")).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(page.locator("[data-page-side-pane-panel], [data-page-dialog-panel]")).toHaveCount(
    0,
  );
});

test("mobile ignores a saved dialog preference without overwriting it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(fixture);
  await page.getByRole("button", { name: "Prefer dialog", exact: true }).click();
  await page.getByRole("button", { name: "Open child", exact: true }).click();
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/child");
  await expect(page.locator("[data-page-side-pane-panel], [data-page-dialog-panel]")).toHaveCount(
    0,
  );
  expect(await page.evaluate(() => window.pageLayoutFixture.settings().embeddedItemsOpenAs)).toBe(
    "dialog",
  );
  expect(await page.evaluate(() => window.pageLayoutFixture.writes)).toEqual([]);
});

test("desktop preference opens a dialog and clicking the same target toggles it closed", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Prefer dialog", exact: true }).click();
  await page.getByRole("button", { name: "Open child", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.evaluate(() => window.pageLayoutOpen("child"));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/main");
});

test("dialog-to-pane presentation switching keeps the page target", async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Direct dialog", exact: true }).click();
  await settlePresentation(page.getByRole("dialog"));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Open pages as", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Side panel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator('[data-page-side-pane-panel] [data-page-layout="pane"]')).toHaveCount(
    1,
  );
  await expect(page.getByLabel("Draft child")).toHaveCount(1);
});

test("row navigation uses database context and preserves that context for the next row", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Open row", exact: true }).click();
  const side = page.locator("[data-page-side-pane-panel]");
  await expect(side.getByRole("button", { name: "Open previous row", exact: true })).toBeDisabled();
  await expect(side.getByRole("button", { name: "Open next row", exact: true })).toBeEnabled();
  await side.getByRole("button", { name: "Open next row", exact: true }).click();
  await expect(side.getByLabel("Draft other")).toHaveCount(1);
  await expect(page.locator("[data-fixture-path]")).toContainText("d=database");
  await expect(side.getByRole("button", { name: "Open previous row", exact: true })).toBeEnabled();
});

test("Effect navigation commands execute synchronously and preserve thrown adapter errors", async ({
  page,
}) => {
  await page.goto(fixture);
  await expect(page.getByLabel("Draft main")).toHaveCount(1);
  const result = await page.evaluate(() => {
    const history = window.pageLayoutFixture.router.history;
    const push = history.push;
    const failure = new Error("history failed");
    const order = [];
    history.push = () => {
      order.push("push");
      throw failure;
    };
    let originalError = false;
    try {
      order.push("before");
      window.pageLayoutCommands.openSidePane("child");
      order.push("after");
    } catch (error) {
      originalError = error === failure;
    } finally {
      history.push = push;
    }
    return { order, originalError };
  });
  expect(result).toEqual({ order: ["before", "push"], originalError: true });
});

for (const audience of ["public", "guest"]) {
  test(`${audience} page uses the common frame with its own available actions`, async ({
    page,
  }) => {
    await page.goto(`${fixture}?audience=${audience}`);
    const frame = page.locator('[data-page-layout="main"]');
    await expect(frame.locator("[data-page-header]")).toHaveCount(1);
    await expect(frame.locator("[data-page-scroll-viewport]")).toHaveCount(1);
    await expect(frame.getByRole("button", { name: "Toggle Sidebar", exact: true })).toHaveCount(0);
    await expect(frame.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
    if (audience === "public")
      await expect(frame.getByRole("link", { name: "Login", exact: true })).toHaveCount(1);
    else {
      await expect(frame.getByText("Guest", { exact: true })).toHaveCount(1);
      await expect(frame.getByRole("button", { name: "Copy link", exact: true })).toHaveCount(1);
    }
  });
}

for (const state of ["loading", "error"]) {
  test(`header remains present while page body is ${state}`, async ({ page }) => {
    await page.goto(`${fixture}?body=${state}`);
    const frame = page.locator('[data-page-layout="main"]');
    await expect(frame.locator("[data-page-header]")).toHaveCount(1);
    await expect(
      frame.getByText(state === "loading" ? "Loading page..." : "Page unavailable.", {
        exact: true,
      }),
    ).toHaveCount(1);
  });
}

test("desktop pane URL participates in back/forward navigation", async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Direct pane", exact: true }).click();
  await expect(page.locator("[data-page-side-pane-panel]")).toHaveAttribute("aria-hidden", "false");
  await page.evaluate(() => window.pageLayoutFixture.router.history.back());
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/main");
  await expect(page.locator("[data-page-side-pane-panel]")).toHaveCount(0);
  await page.evaluate(() => window.pageLayoutFixture.router.history.forward());
  await expect(page.locator("[data-fixture-path]")).toContainText("p=child");
  await expect(page.locator("[data-page-side-pane-panel]")).toHaveAttribute("aria-hidden", "false");
});

for (const audience of ["public", "guest"]) {
  test(`${audience} pane promotion works without an application sidebar provider`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${fixture}?audience=${audience}`);
    await page.getByRole("button", { name: "Direct pane", exact: true }).click();
    const panel = page.locator("[data-page-side-pane-panel]");
    await expect(panel).toHaveAttribute("aria-hidden", "false");
    await settlePresentation(panel);
    const frame = panel.locator("[data-page-layout]");
    await frame.getByRole("link", { name: "Open as full page", exact: true }).click();
    await expect(frame).toHaveAttribute("data-page-layout", "main");
    await expect(frame.getByLabel("Draft child")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
