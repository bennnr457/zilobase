import { test, expect } from "@playwright/test";

for (const target of ["page", "database"]) {
  test(`${target} sharing retains member grants, publishing and links`, async ({ page }) => {
    await page.addInitScript(() => {
      window.copiedLinks = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (value) => window.copiedLinks.push(value) },
      });
    });
    await page.goto(`/scripts/editor/e2e/page-layout.html?sharing=${target}`);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    const panel = page.getByRole("tabpanel", { name: "Share", exact: true });
    await expect(panel.getByText("Owner (You)", { exact: true })).toBeVisible();
    const members = panel.getByRole("combobox").filter({ hasText: "Search members" });
    await expect(members).toBeEnabled();
    if (target === "page") {
      await expect(panel.getByLabel("Guest email")).toBeVisible();
      const gaps = await panel.evaluate((node) => {
        const popover = node.closest('[data-slot="popover-content"]');
        const sections = [
          popover.firstElementChild,
          popover.querySelector('[data-slot="tabs-list"]'),
          ...node.children,
        ];
        return sections
          .slice(1)
          .map((section, index) =>
            Math.round(
              section.getBoundingClientRect().top - sections[index].getBoundingClientRect().bottom,
            ),
          );
      });
      expect(gaps).toEqual([16, 16, 16, 16, 16]);
      await panel.getByLabel("Guest email").fill(" Guest@Example.Test ");
      await panel.getByRole("button", { name: "Invite", exact: true }).click();
      await expect(panel.getByText("guest@example.test", { exact: true })).toBeVisible();
    } else {
      await expect(panel.getByLabel("Guest email")).toHaveCount(0);
    }
    await members.click();
    await page.getByPlaceholder("Search by name or email...").fill("Alice");
    await page.getByRole("option").filter({ hasText: "Alice" }).click();
    await panel.getByRole("button", { name: "Share", exact: true }).click();
    await expect(panel.getByText("Alice", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.copiedLinks.at(-1)))
      .toContain(target === "page" ? "/p/main" : "/d/database");
    await page.getByRole("tab", { name: "Publishing", exact: true }).click();
    const publish = page.getByRole("tabpanel", { name: "Publishing", exact: true });
    await publish.getByRole("switch").click();
    await expect(publish.getByRole("switch")).toBeChecked();
    await expect(publish.getByRole("button", { name: "Copy link", exact: true })).toBeEnabled();
    const writes = await page.evaluate(() => window.pageLayoutFixture.sharingWrites);
    expect(writes.some(({ body }) => body.targetId === "alice")).toBe(true);
    expect(writes.some(({ body }) => body.targetType === "public")).toBe(true);
  });

  test(`${target} viewing permission keeps sharing management disabled`, async ({ page }) => {
    await page.goto(`/scripts/editor/e2e/page-layout.html?sharing=${target}&access=view`);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect(page.getByRole("combobox").filter({ hasText: "Search members" })).toBeDisabled();
    await expect(page.getByLabel("Guest email")).toHaveCount(0);
    await page.getByRole("tab", { name: "Publishing", exact: true }).click();
    await expect(page.getByRole("switch")).toBeDisabled();
    expect(await page.evaluate(() => window.pageLayoutFixture.sharingWrites)).toEqual([]);
  });
}

test("settings shell switches account and workspace sections and dismisses", async ({ page }) => {
  await page.goto("/scripts/editor/e2e/page-layout.html?workspace=settings");
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog.getByRole("heading", { name: "Security", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Workspace", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Reopen settings", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.pageLayoutFixture.writes)).toEqual([]);
});
