import { writePrompt } from "./ai-composer-helpers.mjs";
import { test, expect } from "@playwright/test";

const url = "/scripts/editor/e2e/page-layout.html?workspace=ai";
const composer = (page) => page.getByRole("textbox", { name: "Ask AI message" });

test("submitted turns show Thinking while tools read sources before the first token", async ({
  page,
}) => {
  await page.goto(url);
  await expect(composer(page)).toBeEnabled();
  await page.getByRole("button", { name: "Attach current page", exact: true }).click();
  await page.evaluate(() => {
    window.pageLayoutFixture.ai.holdReads = true;
    window.pageLayoutFixture.ai.holdFirstToken = true;
    window.pageLayoutFixture.ai.holdStream = true;
  });
  await writePrompt(page, "Show my selected sources");
  await composer(page).press("Enter");
  await expect(page.locator(".is-user")).toContainText("Show my selected sources");
  await expect(page.getByRole("status", { name: "Thinking", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await page.evaluate(() => window.pageLayoutFixture.ai.releaseReads());
  await expect(page.getByRole("status", { name: "Thinking", exact: true })).toBeVisible();
  await expect(page.locator(".is-user")).toHaveCount(1);
  await expect(page.locator(".is-assistant")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Copy response" })).toHaveCount(0);
  await page.evaluate(() => window.pageLayoutFixture.ai.releaseFirstToken());
  await expect(page.locator(".is-assistant")).toContainText("Attached records are partial.");
  await expect(page.getByRole("status", { name: "Thinking", exact: true })).toHaveCount(0);
  await page.evaluate(() => window.pageLayoutFixture.ai.appendAnswer(" More streamed text."));
  await expect(page.locator(".is-assistant")).toContainText("More streamed text.");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(composer(page)).toBeEnabled();
  await expect(page.getByRole("button", { name: "Copy response" })).toBeVisible();
});

test("copy uses display text, reports failures, ratings toggle exclusively, and retry sends again", async ({
  page,
}) => {
  await page.goto(url);
  await expect(composer(page)).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copiedResponse = text;
        },
      },
    });
  });
  await writePrompt(page, "An answer please");
  await composer(page).press("Enter");
  const copy = page.getByRole("button", { name: "Copy response", exact: true });
  await copy.click();
  await expect
    .poll(() => page.evaluate(() => window.copiedResponse))
    .toBe("Attached records are partial.");
  await expect(page.getByRole("button", { name: "Copied response", exact: true })).toBeVisible();
  const like = page.getByRole("button", { name: "Like response", exact: true });
  const dislike = page.getByRole("button", { name: "Dislike response", exact: true });
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await dislike.click();
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await expect(dislike).toHaveAttribute("aria-pressed", "true");
  await dislike.click();
  await expect(dislike).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error("Denied");
    };
  });
  await page.getByRole("button", { name: "Copied response", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Could not copy response" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry response", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.pageLayoutFixture.ai.requests.length)).toBe(2);
  await expect(page.locator(".is-assistant")).toHaveCount(2);
});

test("Stop before the first token clears Thinking and ignores late tokens", async ({ page }) => {
  await page.goto(url);
  await expect(composer(page)).toBeEnabled();
  await page.evaluate(() => {
    window.pageLayoutFixture.ai.holdFirstToken = true;
  });
  await writePrompt(page, "Wait for the model");
  await composer(page).press("Enter");
  await expect(page.getByRole("status", { name: "Thinking", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(composer(page)).toBeEnabled();
  await expect(page.getByRole("status", { name: "Thinking", exact: true })).toHaveCount(0);
  await page.evaluate(() => window.pageLayoutFixture.ai.releaseFirstToken());
  await expect(page.locator(".is-assistant")).not.toContainText("Attached records are partial.");
});
