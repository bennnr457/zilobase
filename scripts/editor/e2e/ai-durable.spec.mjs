import { test, expect } from "@playwright/test";
const url = "/scripts/editor/e2e/page-layout.html?workspace=ai&appSidebar=1&durableAi=1";
const composer = (page) => page.getByRole("textbox", { name: "Ask AI message" });
async function start(page) {
  await page.goto(url);
  await expect(composer(page)).toBeEnabled();
  await page.evaluate(() => {
    window.pageLayoutFixture.ai.holdStream = true;
  });
  await composer(page).fill("Durable conversation");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.locator(".is-assistant")).toContainText("Partial");
}
test("hard reload resumes the saved run without duplicate text or another submission", async ({
  page,
}) => {
  await start(page);
  await page.reload();
  await expect(page.locator(".is-assistant")).toContainText("Partial answer");
  await expect(composer(page)).toBeEnabled();
  await expect(page.locator(".is-user")).toHaveCount(1);
  await expect(page.locator(".is-assistant")).toHaveCount(1);
  expect(await page.evaluate(() => sessionStorage.getItem("ai-fixture-provider-starts"))).toBe("1");
  expect(await page.evaluate(() => window.pageLayoutFixture.ai.cancelled)).toBe(0);
});
test("explicit Stop targets the persisted run and preserves its partial answer", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(composer(page)).toBeEnabled();
  await expect(page.locator(".is-assistant")).toContainText("Partial");
  await expect(page.locator(".is-assistant")).toContainText("stopped");
  expect(await page.evaluate(() => window.pageLayoutFixture.ai.cancelled)).toBe(1);
});
