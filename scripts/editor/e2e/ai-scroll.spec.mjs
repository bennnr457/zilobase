import { test, expect } from "@playwright/test";

test("history owns scrolling while the composer stays fixed and readers can return to latest", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "ai-fixture-threads",
      JSON.stringify([
        {
          thread: {
            id: "long-thread",
            workspaceId: "workspace",
            title: "Long conversation",
            updatedAt: "2026-10-20T00:00:00Z",
          },
          roots: [],
          messages: Array.from({ length: 30 }, (_, index) => ({
            id: `message-${index}`,
            role: index % 2 ? "assistant" : "user",
            text:
              `Message ${index}: ` +
              "An existing conversation with enough history to scroll. ".repeat(5),
          })),
        },
      ]),
    );
  });
  await page.goto("/scripts/editor/e2e/page-layout.html?workspace=ai");
  const input = page.getByRole("textbox", { name: "Ask AI message" });
  await expect(input).toBeEnabled();
  const history = page.locator("[data-ai-scroll-shell]");
  await expect.poll(() => history.evaluate((node) => node.scrollTop)).toBeGreaterThan(100);
  const before = await input.boundingBox();
  await history.hover();
  await page.mouse.wheel(0, -20000);
  await expect(page.getByRole("button", { name: "Scroll to bottom", exact: true })).toBeVisible();
  await expect.poll(() => history.evaluate((node) => node.scrollTop)).toBeLessThan(100);
  expect(await input.boundingBox()).toEqual(before);
  await page.getByRole("button", { name: "Scroll to bottom", exact: true }).click();
  await expect
    .poll(() => history.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight))
    .toBeLessThan(2);
  expect(await input.boundingBox()).toEqual(before);
  expect(
    await history.evaluate(
      (node) =>
        Array.from(node.querySelectorAll("*")).filter(
          (child) =>
            getComputedStyle(child).overflowY === "auto" &&
            child.scrollHeight > child.clientHeight + 1,
        ).length,
    ),
  ).toBe(0);
});
