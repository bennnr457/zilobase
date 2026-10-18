import { test, expect } from "@playwright/test";
const fixture = "/scripts/editor/e2e/page-layout.html?workspace=meeting";

test("embedded meetings use the shared tabs and compact card geometry", async ({ page }) => {
  await page.goto(fixture);
  const shell = page.locator(".meeting-block-shell");
  await expect(shell.getByLabel("Meeting title", { exact: true })).toHaveValue("Meeting");
  await expect(shell).toHaveCSS("border-radius", "10px");
  await expect(shell.locator(".meeting-block-header")).toHaveCSS("padding-left", "12px");
  await expect(shell.locator(".meeting-block-toolbar")).toHaveCSS("padding-top", "0px");
  await expect(shell.locator(".meeting-block-body")).toHaveCSS("padding-left", "12px");
  const tabs = shell.getByRole("tablist", { name: "Meeting sections" });
  await expect(tabs).toHaveCSS("border-radius", "0px");
  for (const label of ["Summary", "Notes", "Transcript"]) {
    const tab = tabs.getByRole("tab", { name: new RegExp(`^${label}$`, "i") });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(tab).toHaveAttribute("data-slot", "tabs-tab");
    await expect(tab).toHaveCSS("height", "28px");
    await expect(tab).toHaveCSS("border-radius", "6px");
    await expect(tab).toHaveCSS("cursor", "pointer");
    await expect(tabs.locator('[aria-selected="true"]')).toHaveCount(1);
  }
  await expect(shell.getByRole("link", { name: "Open Related page" })).toHaveCSS("height", "28px");
  await expect(shell.getByRole("link", { name: "Open Related page" })).toHaveCSS(
    "text-decoration-line",
    "none",
  );
  await shell.getByRole("button", { name: "Start transcribing" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Everyone must be notified.");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  for (const dark of [false, true]) {
    await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), dark);
    await shell.screenshot({
      path: test.info().outputPath(dark ? "meeting-dark.png" : "meeting-light.png"),
    });
  }
});

test("meeting tabs and controls remain accessible on narrow and read-only layouts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto(fixture);
  const shell = page.locator(".meeting-block-shell");
  await expect(shell.getByRole("button", { name: "Start transcribing" })).toBeVisible();
  expect(await shell.evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(
    await shell.evaluate((el) => el.clientWidth),
  );
  await shell.getByRole("tab", { name: "summary", exact: true }).click();
  await expect(shell.getByRole("tab", { name: "summary", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.goto(`${fixture}&readonly`);
  await expect(shell.getByLabel("Meeting title", { exact: true })).toBeDisabled();
  await expect(shell.getByRole("button", { name: "Start transcribing" })).toHaveCount(0);
  await shell.getByRole("tab", { name: "transcript", exact: true }).click();
  await expect(shell.getByRole("tab", { name: "transcript", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.goto(`${fixture}&full`);
  await expect(shell).toHaveClass(/meeting-block-shell-full/);
  await expect(shell.getByRole("tab", { name: "notes", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(shell.getByRole("link", { name: "Expand meeting", exact: true })).toHaveCount(0);
});
