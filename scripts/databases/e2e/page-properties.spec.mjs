import { test, expect } from "@playwright/test";
const state = (page) => page.getByTestId("metadata").textContent().then(JSON.parse);
test.beforeEach(async ({ page }) => {
  await page.goto("/scripts/databases/e2e/page-properties.html");
  await expect(page.getByRole("button", { name: "Open loaded item" })).toBeVisible();
});
test("loaded database properties render while the authoritative request is pending", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open loaded item" }).click();
  await expect
    .poll(() => state(page))
    .toMatchObject({
      names: ["Status", "Name"],
      values: ["Not started"],
      coverage: "partial",
      loading: false,
      refreshing: true,
    });
  expect(await page.evaluate(() => window.propertyProof.requests)).toEqual([
    "/pages/page-1/properties",
  ]);
  await page.evaluate(() => window.propertyProof.resolve());
  await expect.poll(() => state(page)).toMatchObject({ coverage: "complete", refreshing: false });
});
test("a direct link with no loaded row retains the cold loading state", async ({ page }) => {
  await page.evaluate(() => window.propertyProof.open("cold-page"));
  await expect
    .poll(() => state(page))
    .toMatchObject({ coverage: "missing", loading: true, refreshing: false });
  expect(await page.evaluate(() => window.propertyProof.requests)).toEqual([
    "/pages/cold-page/properties",
  ]);
});

test("a fresh complete loaded item opens without a properties request", async ({ page }) => {
  await page.evaluate(() => window.propertyProof.authorize());
  await page.getByRole("button", { name: "Open loaded item" }).click();
  await expect
    .poll(() => state(page))
    .toMatchObject({
      coverage: "complete",
      names: ["Status", "Name"],
      values: ["Not started"],
      loading: false,
      refreshing: false,
    });
  expect(await page.evaluate(() => window.propertyProof.requests)).toEqual([]);
  await page.getByRole("button", { name: "Close item" }).click();
  await page.getByRole("button", { name: "Open loaded item" }).click();
  await expect.poll(() => state(page)).toMatchObject({ coverage: "complete" });
  expect(await page.evaluate(() => window.propertyProof.requests)).toEqual([]);
});

test("a failed background read keeps known properties visible", async ({ page }) => {
  await page.getByRole("button", { name: "Open loaded item" }).click();
  await expect.poll(() => state(page)).toMatchObject({ refreshing: true });
  await page.evaluate(() => window.propertyProof.fail(500));
  await expect
    .poll(() => state(page))
    .toMatchObject({
      names: ["Status", "Name"],
      values: ["Not started"],
      coverage: "partial",
      loading: false,
      refreshing: false,
      refreshError: true,
    });
});

test("a permission denial immediately suppresses the cached projection", async ({ page }) => {
  await page.getByRole("button", { name: "Open loaded item" }).click();
  await expect.poll(() => state(page)).toMatchObject({ coverage: "partial" });
  await page.evaluate(() => window.propertyProof.fail(403));
  await expect.poll(() => state(page)).toMatchObject({ coverage: "missing", refreshing: false });
  expect((await state(page)).values).toBeUndefined();
});

test("account switching clears visible properties and ignores the old response", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open loaded item" }).click();
  await expect.poll(() => state(page)).toMatchObject({ values: ["Not started"] });
  await page.evaluate(() => window.propertyProof.changeAccount());
  await expect.poll(() => state(page)).toMatchObject({ coverage: "missing" });
  await page.evaluate(() => window.propertyProof.resolveOriginal());
  await expect.poll(() => state(page)).toMatchObject({ coverage: "missing" });
  expect((await state(page)).values).toBeUndefined();
});
