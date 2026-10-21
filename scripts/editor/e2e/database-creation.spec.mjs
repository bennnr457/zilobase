import { test, expect } from "@playwright/test";

test("slash database opens setup before delivery and removes only its block on rejection", async ({
  page,
}) => {
  await page.goto("/scripts/editor/e2e/page-layout.html?workspace=database-creation", {
    waitUntil: "domcontentloaded",
  });
  const editor = page.locator(".tiptap-editor[contenteditable=true]");
  await editor.fill("/database");
  await page.getByRole("option", { name: /Database.*Table where every row is a page/ }).click();

  // The API response remains blocked for this entire assertion. A host with
  // no source has no record window to wait for before showing its setup card.
  const block = page.locator('[data-type="databaseBlock"]');
  await expect(block).toHaveCount(1);
  await expect(block.getByPlaceholder("Describe what you want to build...")).toBeVisible();
  expect(await page.evaluate(() => window.pageLayoutFixture.databaseCreations.length)).toBe(1);
  expect(
    await page.evaluate(() =>
      window.pageLayoutFixture.requests.filter((path) => path.includes("/bootstrap")),
    ),
  ).toEqual([]);

  const paragraph = editor.locator(":scope > p").last();
  await paragraph.click();
  await page.keyboard.type("Keep this text");
  await page.evaluate(() => window.pageLayoutFixture.rejectDatabaseCreation());
  await expect(block).toHaveCount(0);
  await expect(editor).toContainText("Keep this text");
});
