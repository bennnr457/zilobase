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
