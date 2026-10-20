import { test, expect } from "@playwright/test";

const url = "/scripts/editor/e2e/page-layout.html?workspace=ai";

for (const type of ["page", "database", "both"]) {
  test(`shared search popover searches ${type} and supports keyboard selection`, async ({
    page,
  }) => {
    await page.goto(`${url}&picker=${type}`);
    await page.getByRole("button", { name: "Choose context" }).click();
    const input = page.getByRole("combobox");
    await expect(input).toBeFocused();
    const options = page.getByRole("option");
    await expect(options).toHaveCount(type === "both" ? 2 : 1);
    const requestedTypes = await page.evaluate(() =>
      window.pageLayoutFixture.ai.searchRequests.map((path) =>
        new URL(path, location.origin).searchParams.get("types"),
      ),
    );
    expect([...new Set(requestedTypes)].sort()).toEqual(
      type === "both" ? ["database", "page"] : [type],
    );
    await input.fill(type === "page" ? "mai" : "Task");
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText(type === "page" ? "main" : "Tasks");
    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(page.getByLabel("Selected context")).toHaveText(
      type === "page" ? "page:main" : "database:Tasks",
    );
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Choose context" })).toBeFocused();
  });
}

for (const width of [1400, 390]) {
  test(`Ask AI context button preserves draft and attaches with the keyboard at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url);
    const composer = page.getByRole("textbox", { name: "Ask AI message" });
    await composer.fill("Summarize");
    await page.getByRole("button", { name: "Add context", exact: true }).click();
    await expect(composer).toHaveValue("Summarize @");
    await expect(composer).toBeFocused();
    await expect(page.getByRole("option", { name: /Tasks.*Database/i })).toBeVisible();
    await composer.press("ArrowDown");
    await composer.press("Enter");
    await expect(page.getByRole("button", { name: "Remove main", exact: true })).toBeVisible();
    await expect(composer).toHaveValue("Summarize ");
    await expect(composer).toBeFocused();
    await expect(page.getByRole("listbox")).toHaveCount(0);
    expect(await page.evaluate(() => window.pageLayoutFixture.ai.requests.length)).toBe(0);
    await page.getByRole("button", { name: "Add context", exact: true }).click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await composer.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(composer).toHaveValue("Summarize @");
  });
}
