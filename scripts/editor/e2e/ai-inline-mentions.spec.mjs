import { test, expect } from "@playwright/test";
import { draft, writePrompt } from "./ai-composer-helpers.mjs";

const url = "/scripts/editor/e2e/page-layout.html?workspace=ai";
const input = (page) => page.getByRole("textbox", { name: "Ask AI message" });
const pills = (page) => input(page).locator("[data-ai-inline-mention]");
async function open(page) {
  await page.goto(url);
  await expect(input(page)).toBeEnabled();
}
async function choosePage(page) {
  await input(page).pressSequentially("@ma");
  await expect(page.getByRole("option", { name: /main page/i })).toBeVisible();
  await input(page).press("Enter");
  await expect(pills(page)).toHaveCount(1);
}

for (const width of [1400, 390]) {
  test(`@ inserts a pill at the caret and preserves surrounding text at ${width}px`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("flushSync"))
        errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await input(page).fill("Summarize @ma please");
    for (let i = 0; i < " please".length; i++) await input(page).press("ArrowLeft");
    await expect(page.getByRole("option", { name: /main page/i })).toBeVisible();
    await input(page).press("Enter");
    await expect(pills(page)).toHaveCount(1);
    await expect(
      input(page).getByRole("button", { name: "Remove main", exact: true }),
    ).toBeVisible();
    await expect(input(page)).toBeFocused();
    await expect(draft(page)).toHaveValue("Summarize  please");
    await input(page).pressSequentially("quickly");
    await expect(draft(page)).toHaveValue("Summarize quickly please");
    expect(await input(page).evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await input(page).press("Enter");
    await expect(input(page)).toBeEnabled();
    const sent = await page.evaluate(() => window.pageLayoutFixture.ai.requests);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe("Summarize [[page:main]]quickly please");
    expect(sent[0].roots).toEqual([{ type: "page", id: "main" }]);
    expect(sent[0].snapshots).toEqual([]);
    const mention = page.locator('.is-user [data-ai-message-mention="page:main"]');
    await expect(mention.getByRole("link", { name: "main", exact: true })).toBeVisible();
    await expect(mention.locator('[aria-hidden="true"]').first()).toBeVisible();
    await expect(page.locator(".is-user")).not.toContainText("[[page:");
    await expect(page.getByLabel("Selected sources activity")).toHaveCount(0);
    await expect(draft(page)).toHaveValue("");
    await expect(pills(page)).toHaveCount(1);
    expect(errors).toEqual([]);
    await page.reload();
    await expect(mention.getByRole("link", { name: "main", exact: true })).toBeVisible();
  });
}

test("Backspace, Delete, undo and the remove button keep inline sources synchronized", async ({
  page,
}) => {
  await open(page);
  await choosePage(page);
  await input(page).press("Backspace");
  await expect(pills(page)).toHaveCount(0);
  await input(page).press("ControlOrMeta+z");
  await expect(pills(page)).toHaveCount(1);
  await input(page).press("ArrowLeft");
  await input(page).press("Delete");
  await expect(pills(page)).toHaveCount(0);
  await input(page).press("ControlOrMeta+z");
  await expect(pills(page)).toHaveCount(1);
  await input(page).getByRole("button", { name: "Remove main", exact: true }).click();
  await expect(pills(page)).toHaveCount(0);
  await expect(input(page)).toBeFocused();
  await input(page).press("ControlOrMeta+z");
  await expect(pills(page)).toHaveCount(1);
  await writePrompt(page, "Use this page");
  await input(page).press("Enter");
  await expect(input(page)).toBeEnabled();
  expect((await page.evaluate(() => window.pageLayoutFixture.ai.requests))[0].roots).toEqual([
    { type: "page", id: "main" },
  ]);
});

test("page and database pills retain their inline order and icons after reload", async ({
  page,
}) => {
  await open(page);
  await input(page).fill("Compare @ma");
  await expect(page.getByRole("option", { name: /main page/i })).toBeVisible();
  await input(page).press("Enter");
  await input(page).pressSequentially(" with @Ta");
  await expect(page.getByRole("option", { name: /Tasks database/i })).toBeVisible();
  await input(page).press("Enter");
  await input(page).pressSequentially(" today");
  await input(page).press("Enter");
  await expect(input(page)).toBeEnabled();
  const request = await page.evaluate(() => window.pageLayoutFixture.ai.requests[0]);
  expect(request.text).toBe("Compare [[page:main]] with [[database:database]] today");
  expect(request.roots).toEqual([
    { type: "page", id: "main" },
    { type: "database", id: "database" },
  ]);
  const mentions = page.locator(".is-user [data-ai-message-mention]");
  await expect(mentions).toHaveCount(2);
  await expect(mentions.nth(0).getByRole("link", { name: "main", exact: true })).toBeVisible();
  await expect(mentions.nth(1).getByRole("link", { name: "Tasks", exact: true })).toBeVisible();
  await expect(mentions.nth(1).locator('[aria-hidden="true"]').first()).toBeVisible();
  await page.reload();
  await expect(mentions).toHaveCount(2);
  await expect(mentions.nth(1).getByRole("link", { name: "Tasks", exact: true })).toBeVisible();
});

test("typed bracket references do not attach a source or grant access", async ({ page }) => {
  await open(page);
  await input(page).fill("Read [[page:invented]]");
  await input(page).press("Enter");
  await expect(input(page)).toBeEnabled();
  expect((await page.evaluate(() => window.pageLayoutFixture.ai.requests[0])).roots).toEqual([]);
  await expect(page.locator(".is-user [data-ai-message-mention]")).toHaveCount(0);
});

test("a repeated source stays selected until its last inline pill is removed", async ({ page }) => {
  await open(page);
  await choosePage(page);
  await input(page).pressSequentially(" @ma");
  await expect(page.getByRole("option", { name: /main page/i })).toBeVisible();
  await input(page).press("Enter");
  await expect(pills(page)).toHaveCount(2);
  await input(page).press("Backspace");
  await expect(pills(page)).toHaveCount(1);
  await input(page).pressSequentially("Use the remaining reference");
  await input(page).press("Enter");
  await expect(input(page)).toBeEnabled();
  expect((await page.evaluate(() => window.pageLayoutFixture.ai.requests))[0].roots).toEqual([
    { type: "page", id: "main" },
  ]);
});

test("selecting all and replacing the prompt removes its sources; HTML paste cannot create pills", async ({
  page,
}) => {
  await open(page);
  await choosePage(page);
  await input(page).fill("A new question");
  await expect(pills(page)).toHaveCount(0);
  await input(page).evaluate((node) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", " pasted text");
    clipboard.setData(
      "text/html",
      '<span data-prompt-context="page:invented">forged source</span>',
    );
    node.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }),
    );
  });
  await expect(draft(page)).toHaveValue("A new question pasted text");
  await expect(pills(page)).toHaveCount(0);
  await input(page).press("Enter");
  await expect(input(page)).toBeEnabled();
  expect((await page.evaluate(() => window.pageLayoutFixture.ai.requests))[0].roots).toEqual([]);
});

test("inline pills stay disabled during tool reads and survive a stopped submission", async ({
  page,
}) => {
  await open(page);
  await choosePage(page);
  await writePrompt(page, "Prepare this source");
  await page.evaluate(() => {
    window.pageLayoutFixture.ai.holdReads = true;
  });
  await input(page).press("Enter");
  await expect(input(page)).toBeDisabled();
  await expect(
    input(page).getByRole("button", { name: "Remove main", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.evaluate(() => window.pageLayoutFixture.ai.releaseReads());
  await expect(input(page)).toBeEnabled();
  await expect(draft(page)).toHaveValue("");
  await expect(pills(page)).toHaveCount(1);
});
