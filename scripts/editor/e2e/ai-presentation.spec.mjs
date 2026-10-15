import { test, expect } from "@playwright/test";

for (const viewport of [
  { width: 1400, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`AI composition retains messages and composer through presentation changes at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/scripts/editor/e2e/page-layout.html?workspace=ai");
    const composer = page.getByPlaceholder("Ask anything about this workspace");
    await composer.fill("Keep this draft through the folder refactor");
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.locator("[data-ai-scroll-shell]")).toContainText(
      "Keep this draft through the folder refactor",
    );
    await expect(composer).toHaveValue("");
    await composer.fill("Unsent follow-up");
    await page.getByRole("button", { name: "Switch to floating chat", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Dock chat in sidebar", exact: true }),
    ).toBeVisible();
    await expect(composer).toHaveValue("Unsent follow-up");
    await expect(page.locator("[data-ai-scroll-shell]")).toContainText(
      "Keep this draft through the folder refactor",
    );
    await expect(page.locator("[data-ai-scroll-shell] textarea")).toHaveCount(0);
    await page.getByRole("button", { name: "Dock chat in sidebar", exact: true }).click();
    await expect(composer).toHaveValue("Unsent follow-up");
    await page.getByRole("button", { name: "Close Ask AI", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reopen chat", exact: true })).toBeVisible();
  });
}
