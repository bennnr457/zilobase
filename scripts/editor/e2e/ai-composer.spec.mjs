import { draft, writePrompt } from "./ai-composer-helpers.mjs";
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
  await writePrompt(page, "Line one");
  await input.press("End");
  await input.press("Shift+Enter");
  await expect(draft(page)).toHaveValue("Line one\n");
  await input.dispatchEvent("compositionstart");
  await input.press("Enter");
  expect(await requests(page)).toHaveLength(0);
  await input.dispatchEvent("compositionend");
  await writePrompt(page, "Line one\n日本語");
  await input.press("Enter");
  await expect(input).toBeEnabled();
  await expect(draft(page)).toHaveValue("");
  const sent = await requests(page);
  expect(sent).toHaveLength(1);
  expect(sent[0].text).toBe("Line one\n日本語");
});

test("repeated form submission is ignored during a source read and Stop stays available", async ({
  page,
}) => {
  await page.goto(url);
  const input = composer(page);
  await expect(input).toBeEnabled();
  await page.getByRole("button", { name: "Attach current page", exact: true }).click();
  await page.evaluate(() => {
    window.pageLayoutFixture.ai.holdReads = true;
  });
  await writePrompt(page, "Prepare this question");
  await input.evaluate((node) => {
    node.closest("form").requestSubmit();
    node.closest("form").requestSubmit();
  });
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.evaluate(() => window.pageLayoutFixture.ai.releaseReads());
  await expect(input).toBeEnabled();
  await expect(draft(page)).toHaveValue("");
  expect(await requests(page)).toHaveLength(1);
});
