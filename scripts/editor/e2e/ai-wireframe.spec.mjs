import { test, expect } from "@playwright/test";

test.use({ timezoneId: "Asia/Kolkata" });

// Empty frames and geometry retain the pre-migration wireframe. Conversation
// images additionally include the requested response actions and source activity.
// Do not update the geometry baselines to accept a layout change.
for (const width of [1400, 390]) {
  for (const mode of ["sidebar", "floating", "page"]) {
    for (const theme of ["light", "dark"]) {
      test(`${mode} ${theme} wireframe at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.clock.setFixedTime(new Date("2026-10-20T08:00:00Z"));
        await page.goto("/scripts/editor/e2e/page-layout.html?workspace=ai");
        await expect(page.getByRole("heading", { name: /Maya/ })).toBeVisible();
        await page.evaluate((theme) => {
          document.documentElement.classList.toggle("dark", theme === "dark");
        }, theme);
        if (mode === "floating") {
          await page.getByRole("button", { name: "Switch to floating chat", exact: true }).click();
        } else if (mode === "page") {
          await page.getByRole("button", { name: "Toggle full page", exact: true }).click();
        }
        const snapshot = `${mode}-${theme}-${width}`;
        const shell = page.locator("[data-ai-workspace-shell]");
        const input = page.getByRole("textbox", { name: "Ask AI message" });
        await expect(input).toBeEnabled();
        await page.evaluate(() => document.fonts.ready);
        await expect(shell).toHaveScreenshot(`${snapshot}-empty.png`, { animations: "disabled" });

        await page.getByRole("button", { name: "Attach current page", exact: true }).click();
        await input.fill("Summarize the plan");
        await page.getByRole("button", { name: "Submit", exact: true }).click();
        await expect(input).toBeEnabled();
        await expect(page.locator(".is-assistant")).toContainText("Attached records are partial");
        await expect(page.getByRole("link", { name: "main", exact: true })).toBeVisible();
        await input.fill("A follow-up\nwith a second line");
        await expect(shell).toHaveScreenshot(`${snapshot}-conversation.png`, {
          animations: "disabled",
        });

        const geometry = await input.evaluate((element) => {
          const history = document.querySelector("[data-ai-scroll-shell]");
          const form = element.closest("form");
          const rect = (node) => {
            const { x, y, width, height } = node.getBoundingClientRect();
            return { x, y, width, height };
          };
          return { input: rect(element), form: rect(form), history: rect(history) };
        });
        expect(JSON.stringify(geometry, null, 2)).toMatchSnapshot(`${snapshot}-geometry.txt`);
        expect(geometry.form.y).toBeGreaterThanOrEqual(
          geometry.history.y + geometry.history.height - 1,
        );
        expect(geometry.form.x + geometry.form.width).toBeLessThanOrEqual(width);
      });
    }
  }
}
