import { draft, writePrompt } from "./ai-composer-helpers.mjs";
import { test, expect } from "@playwright/test";

const url = "/scripts/editor/e2e/page-layout.html?workspace=ai&appSidebar=1";
const composer = (page) => page.getByRole("textbox", { name: "Ask AI message" });
const history = (page) => page.getByRole("list", { name: "AI chats", exact: true });
const openSidebar = async (page) => {
  if (!(await page.getByRole("button", { name: "New AI chat", exact: true }).isVisible()))
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
};
const newChat = async (page) => {
  await openSidebar(page);
  await page.getByRole("button", { name: "New AI chat", exact: true }).click();
};
const select = async (page, name) => {
  await openSidebar(page);
  await history(page).getByRole("button", { name, exact: true }).click();
};
const send = async (page, text) => {
  await writePrompt(page, text);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.locator(".is-user").last()).toContainText(text);
  await expect(composer(page)).toBeEnabled();
};

for (const width of [1400, 390]) {
  test(`existing AI sidebar creates and reopens isolated threads at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url);
    await expect(composer(page)).toBeEnabled();
    await expect(page.getByRole("button", { name: "Previous chats", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New chat", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Attach current page", exact: true }).click();
    await send(page, "First conversation");
    await openSidebar(page);
    await expect(
      history(page).getByRole("button", { name: "First conversation", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await newChat(page);
    await expect(page.locator(".is-user")).toHaveCount(0);
    await expect(draft(page)).toHaveValue("");
    await composer(page).focus();
    await composer(page).press("ControlOrMeta+z");
    await expect(draft(page)).toHaveValue("");
    await expect(page.getByRole("button", { name: "Remove main", exact: true })).toHaveCount(0);
    await expect(page.locator("summary", { hasText: "Last sent context" })).toHaveCount(0);
    await send(page, "Second conversation");
    await select(page, "First conversation");
    await expect(page.locator(".is-user")).toContainText(["First conversation"]);
    await expect(page.getByRole("button", { name: "Remove main", exact: true })).toBeVisible();
    await send(page, "Continue first");
    await expect(page.locator(".is-user")).toHaveCount(2);
    const requests = await page.evaluate(() => window.pageLayoutFixture.ai.requests);
    expect(requests[0].threadId).toBeUndefined();
    expect(requests[1].threadId).toBeUndefined();
    expect(requests[2].threadId).toBeTruthy();
    await select(page, "Second conversation");
    await expect(page.locator(".is-user")).toContainText(["Second conversation"]);
    await expect(page.getByRole("button", { name: "Remove main", exact: true })).toHaveCount(0);
    await page.reload();
    await openSidebar(page);
    await expect(history(page).getByRole("button")).toHaveCount(2);
    await select(page, "First conversation");
    await expect(page.locator(".is-user")).toContainText(["First conversation", "Continue first"]);
  });
}

test("late conversation loads cannot overwrite a new chat", async ({ page }) => {
  await page.goto(url);
  await send(page, "Saved conversation");
  await newChat(page);
  await page.evaluate(() => {
    window.pageLayoutFixture.ai.holdThreadReads = true;
    window.pageLayoutFixture.queryClient.removeQueries({
      predicate: (query) => query.queryKey[2] === "thread",
    });
  });
  await select(page, "Saved conversation");
  await expect(composer(page)).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Loading conversation" })).toBeVisible();
  await newChat(page);
  await expect(composer(page)).toBeEnabled();
  await writePrompt(page, "Fresh draft");
  await page.evaluate(() => window.pageLayoutFixture.ai.releaseThreadReads());
  await expect(draft(page)).toHaveValue("Fresh draft");
  await expect(page.locator(".is-user")).toHaveCount(0);
});

test("new chat interrupts a stream and keeps the old conversation in sidebar history", async ({
  page,
}) => {
  await page.goto(url);
  await expect(composer(page)).toBeEnabled();
  await page.evaluate(() => {
    window.pageLayoutFixture.ai.holdStream = true;
  });
  await writePrompt(page, "Interrupted conversation");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.locator(".is-assistant")).toBeVisible();
  await newChat(page);
  await expect(composer(page)).toBeEnabled();
  await expect(page.locator(".is-user")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.pageLayoutFixture.ai.cancelled)).toBe(1);
  await select(page, "Interrupted conversation");
  await expect(page.locator(".is-user")).toContainText(["Interrupted conversation"]);
  await expect(page.locator(".is-assistant")).toContainText("Attached records are partial");
  await expect(page.getByText("stopped", { exact: true })).toHaveCount(0);
});

test("new chat detaches an ongoing tool read and clears its draft", async ({ page }) => {
  await page.goto(url);
  await expect(composer(page)).toBeEnabled();
  await page.getByRole("button", { name: "Attach current page", exact: true }).click();
  await page.evaluate(() => {
    window.pageLayoutFixture.ai.holdReads = true;
  });
  await writePrompt(page, "Old draft");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await newChat(page);
  await expect(composer(page)).toBeEnabled();
  await composer(page).focus();
  await composer(page).press("ControlOrMeta+z");
  await expect(draft(page)).toHaveValue("");
  await expect(composer(page).locator("[data-ai-inline-mention]")).toHaveCount(0);
  await writePrompt(page, "New draft");
  await page.evaluate(() => window.pageLayoutFixture.ai.releaseReads());
  await expect(draft(page)).toHaveValue("New draft");
  await expect(page.locator(".is-user")).toHaveCount(0);
  expect(await page.evaluate(() => window.pageLayoutFixture.ai.requests.length)).toBe(1);
});
