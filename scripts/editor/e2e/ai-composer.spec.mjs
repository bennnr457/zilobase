import { test, expect } from "@playwright/test";

const url = "/scripts/editor/e2e/page-layout.html?workspace=ai";
const composer = (page) => page.getByRole("textbox", { name: "Ask AI message" });
const requests = (page) => page.evaluate(() => window.pageLayoutFixture.ai.requests);

test("Shift+Enter and IME retain the draft; Enter submits the completed text once", async ({
  page,
}) => {
  await page.goto(url);
  const input = composer(page);
  await expect(input).toBeEnabled();
  await input.fill("Line one");
  await input.press("End");
  await input.press("Shift+Enter");
  await expect(input).toHaveValue("Line one\n");
  await input.dispatchEvent("compositionstart");
  await input.press("Enter");
  expect(await requests(page)).toHaveLength(0);
  await input.dispatchEvent("compositionend");
  await input.fill("Line one\n日本語");
  await input.press("Enter");
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue("");
  const sent = await requests(page);
  expect(sent).toHaveLength(1);
  expect(sent[0].text).toBe("Line one\n日本語");
});

test("repeated form submission is ignored during preparation and Stop stays available", async ({
  page,
}) => {
  await page.goto(url);
  const input = composer(page);
  await expect(input).toBeEnabled();
  await page.getByRole("button", { name: "Attach current page", exact: true }).click();
  await page.evaluate(() => {
    window.pageLayoutFixture.ai.holdReads = true;
  });
  await input.fill("Prepare this question");
  await input.evaluate((node) => {
    node.form.requestSubmit();
    node.form.requestSubmit();
  });
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.evaluate(() => window.pageLayoutFixture.ai.releaseReads());
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue("Prepare this question");
  expect(await requests(page)).toHaveLength(0);
});
