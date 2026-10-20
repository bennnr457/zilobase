import { writePrompt } from "./ai-composer-helpers.mjs";
import { test, expect } from "@playwright/test";

const url = "/scripts/editor/e2e/ai-components.html?patterns=1";
const pattern = (page, name) => page.locator(`[data-ai-pattern="${name}"]`).first();

test("the chat activity slot transitions from pending to tool activity to streaming without duplicate rows", async ({
  page,
}) => {
  await page.goto("/scripts/editor/e2e/ai-components.html?activity-message=1");
  await expect(page.getByRole("status", { name: "Thinking", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Emit activity", exact: true }).click();
  await expect(page.getByLabel("Assistant activity")).toContainText("Load page content");
  await expect(page.getByRole("status", { name: "Thinking", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Emit activity", exact: true }).click();
  await expect(page.locator('[data-activity-id="read"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Complete activity", exact: true }).click();
  await expect(page.locator('[data-activity-id="read"]')).toContainText("1 of 1 done");
  await expect(page.getByRole("status", { name: "Thinking", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stream answer", exact: true }).click();
  await page.getByRole("button", { name: "Stream answer", exact: true }).click();
  await expect(page.locator(".is-assistant")).toContainText("Streamed answer. Streamed answer.");
  await expect(page.getByRole("status", { name: "Thinking", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy response", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Finish answer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copy response", exact: true })).toBeVisible();
});

for (const width of [1400, 390]) {
  test(`activity patterns display real data, update in place, and remain usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url);
    for (const name of [
      "reasoning",
      "task",
      "plan",
      "queue",
      "chain-of-thought",
      "subagent",
      "tool",
      "terminal",
      "test-results",
      "stack-trace",
      "confirmation",
      "checkpoint",
      "file-tree",
      "context",
      "inline-citation",
      "model-selector",
    ])
      await expect(pattern(page, name)).toBeVisible();
    await expect(pattern(page, "reasoning")).toContainText("Provider-supplied public summary.");
    await page.getByRole("button", { name: "Complete reasoning", exact: true }).click();
    await expect(pattern(page, "reasoning").getByRole("button")).toContainText("2s");
    await expect(pattern(page, "reasoning")).not.toContainText("Provider-supplied public summary.");
    await pattern(page, "reasoning").getByRole("button").click();
    await expect(pattern(page, "reasoning")).toContainText("Provider-supplied public summary.");
    await page.getByRole("button", { name: "Complete task", exact: true }).click();
    await expect(pattern(page, "task")).toContainText("3 of 3 done");
    await expect(page.locator('[data-ai-pattern="task"]')).toHaveCount(1);
    await expect(pattern(page, "queue")).toContainText("2 to do");
    await expect(pattern(page, "queue")).toContainText("1 completed");
    const tool = page.locator('[data-activity-id="tool"]');
    await tool.getByRole("button").click();
    await expect(tool).toContainText("<literal> page content");
    await pattern(page, "terminal").getByRole("button").click();
    await expect(pattern(page, "terminal")).toContainText("Build succeeded");
    await expect(pattern(page, "terminal")).toContainText("Exit 0");
    await expect(pattern(page, "test-results")).toContainText("3 tests, 1 failed, 1 skipped");
    await expect(pattern(page, "test-results")).toContainText("Expected source to exist");
    await expect(pattern(page, "stack-trace")).toContainText("src/context.ts:12:3");
    await expect(pattern(page, "stack-trace")).not.toContainText("node:internal");
    await pattern(page, "stack-trace")
      .getByRole("button", { name: /1 framework frames/ })
      .click();
    await expect(pattern(page, "stack-trace")).toContainText("node:internal");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test("approvals, checkpoints and files invoke supplied capabilities; absent capabilities expose no command", async ({
  page,
}) => {
  await page.goto(url);
  await pattern(page, "file-tree").getByRole("button", { name: "context.ts", exact: true }).click();
  await expect(page.getByLabel("Last activity action")).toHaveText("file:src/context.ts");
  await page.getByRole("button", { name: "Restore to Before update", exact: true }).click();
  await expect(page.getByLabel("Last activity action")).toHaveText("restore:checkpoint");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByLabel("Last activity action")).toHaveText("confirmation:true");
  await expect(pattern(page, "confirmation")).toContainText("Approved");
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Toggle capabilities", exact: true }).click();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Restore to Before update", exact: true }),
  ).toHaveCount(0);
  await expect(
    pattern(page, "file-tree").getByRole("button", { name: "context.ts", exact: true }),
  ).toBeDisabled();
});

test("context, inline citations and model selection use supplied metadata and safe links", async ({
  page,
}) => {
  await page.goto(url);
  await page.getByRole("button", { name: "10% context", exact: true }).focus();
  await expect(page.getByRole("progressbar", { name: "Context used" })).toHaveAttribute(
    "aria-valuenow",
    "10",
  );
  await expect(page.getByLabel("Context usage")).toContainText("1,000 / 10,000");
  await page.getByRole("link", { name: "Authorized reference", exact: true }).focus();
  await expect(page.getByText("Reference excerpt", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Unsafe reference", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Choose model", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: /Unavailable model/ })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.getByRole("menuitemradio", { name: /Second model/ }).click();
  await expect(page.getByRole("button", { name: "Choose model", exact: true })).toContainText(
    "Second model",
  );
});

test("attached sources appear in the sent message without a selected-source section", async ({
  page,
}) => {
  await page.goto("/scripts/editor/e2e/page-layout.html?workspace=ai");
  const input = page.getByRole("textbox", { name: "Ask AI message" });
  await expect(input).toBeEnabled();
  await page.getByRole("button", { name: "Attach current page", exact: true }).click();
  await writePrompt(page, "Summarize this page");
  await input.press("Enter");
  await expect(input).toBeEnabled();
  await expect(
    page.locator(".is-user").getByRole("link", { name: "main", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Selected sources activity")).toHaveCount(0);
  await expect(page.getByLabel("Assistant activity")).toHaveCount(0);
  await expect(page.getByText("Search workspace", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(
    page.locator(".is-user").getByRole("link", { name: "main", exact: true }),
  ).toBeVisible();
});
