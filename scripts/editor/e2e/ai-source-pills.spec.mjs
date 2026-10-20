import { test, expect } from "@playwright/test";

async function openSources(page, mode) {
  await page.addInitScript(() => {
    const roots = [
      { type: "page", id: "child" },
      { type: "database", id: "database" },
    ];
    const at = "2026-10-20T00:00:00Z";
    const context = {
      version: 1,
      markdown: "",
      charCount: 0,
      status: "complete",
      omissions: [],
      trimmedAttachmentIds: [],
      manifest: [
        {
          key: "page:child",
          type: "page",
          id: "child",
          pageId: "child",
          title: "Old page title",
          provenance: { origin: "saved", capturedAt: at },
        },
        {
          key: "database:database",
          type: "database",
          id: "database",
          databaseId: "database",
          title: "Database",
          provenance: { origin: "saved", capturedAt: at },
        },
        {
          key: "source:source",
          type: "source",
          id: "source",
          databaseId: "database",
          sourceId: "source",
          title: "Records",
          provenance: { origin: "saved", capturedAt: at },
        },
      ],
    };
    sessionStorage.setItem(
      "ai-fixture-threads",
      JSON.stringify([
        {
          thread: {
            id: "00000000-0000-4000-8000-000000000222",
            workspaceId: "workspace",
            title: "Source pills",
            updatedAt: at,
          },
          roots,
          messages: [
            {
              id: "user",
              role: "user",
              text: "Compare [[page:child]] and [[database:database]]",
              roots,
            },
            {
              id: "assistant",
              role: "assistant",
              text: "Found sources. [[page:child]] [[database:database]] [[source:source]]",
              status: "completed",
              roots,
              context,
              progress: {
                canContinue: false,
                activities: [
                  {
                    id: "describe",
                    name: "describe_source",
                    label: "Inspecting source",
                    source: { type: "database", id: "database" },
                    status: "completed",
                    returned: 1,
                    hasMore: false,
                  },
                  {
                    id: "query",
                    name: "query_records",
                    label: "Reading records",
                    source: { type: "database", id: "database", dataSourceId: "source" },
                    status: "completed",
                    returned: 3,
                    hasMore: false,
                  },
                  {
                    id: "read",
                    name: "read_page",
                    label: "Reading page",
                    source: { type: "page", id: "child" },
                    status: "completed",
                    returned: 10,
                    hasMore: false,
                  },
                ],
              },
            },
          ],
        },
      ]),
    );
  });
  await page.goto(
    `/scripts/editor/e2e/page-layout.html?workspace=ai${mode === "page" ? "&appSidebar=1" : ""}`,
  );
  await expect(page.locator(".is-assistant")).toContainText("Found sources.");
  if (mode === "floating")
    await page.getByRole("button", { name: "Switch to floating chat", exact: true }).click();
  const reading = page.getByLabel("Source reading activity", { exact: true });
  for (const name of ["Source inspected", "Records read", "Page read"]) {
    await reading.getByRole("button", { name: new RegExp(name) }).click();
  }
}

for (const mode of ["page", "sidebar", "floating"]) {
  test(`${mode} chat uses actual names and icons and opens every source pill in the correct pane`, async ({
    page,
  }) => {
    await openSources(page, mode);
    const reading = page.getByLabel("Source reading activity", { exact: true });
    await expect(reading.getByRole("link", { name: "Tasks", exact: true })).toHaveCount(2);
    await expect(reading.getByRole("link", { name: "Tasks", exact: true }).first()).toContainText(
      "🗃️",
    );
    await expect(reading.getByRole("link", { name: "child", exact: true })).toContainText("✅");
    await expect(reading.getByRole("link", { name: "Database", exact: true })).toHaveCount(0);
    const answers = page.getByLabel("Answer sources", { exact: true });
    await expect(answers.getByRole("link", { name: "Tasks", exact: true })).toHaveCount(2);
    await expect(answers.getByRole("link", { name: "Records", exact: true })).toHaveCount(0);
    const appearance = (element) => {
      const style = getComputedStyle(element);
      const title = getComputedStyle(element.querySelector('[data-slot="attachment-title"]'));
      return {
        height: style.height,
        background: style.backgroundColor,
        border: style.borderColor,
        radius: style.borderRadius,
        padding: style.padding,
        gap: style.gap,
        color: style.color,
        titleSize: title.fontSize,
        titleWeight: title.fontWeight,
      };
    };
    const composerPill = page
      .getByRole("textbox", { name: "Ask AI message" })
      .locator('[data-ai-inline-mention="database:database"] [data-slot="attachment"]');
    const expectedAppearance = await composerPill.evaluate(appearance);
    for (const origin of [page.locator(".is-user"), reading, answers]) {
      const pill = origin.getByRole("link", { name: "Tasks", exact: true }).first();
      expect(await pill.evaluate(appearance)).toEqual(expectedAppearance);
      await expect(pill.getByRole("button", { name: /Remove/ })).toHaveCount(0);
    }
    const initial = mode === "page" ? "/ai" : "/p/main";
    for (const origin of [page.locator(".is-user"), reading, answers]) {
      for (const [name, type, id] of [
        ["child", "page", "child"],
        ["Tasks", "database", "database"],
      ]) {
        await page.evaluate(
          (initial) => window.pageLayoutFixture.router.history.replace(initial),
          initial,
        );
        await origin.getByRole("link", { name, exact: true }).first().click();
        await expect
          .poll(() =>
            page.evaluate(() => ({
              pathname: window.pageLayoutFixture.router.state.location.pathname,
              search: window.pageLayoutFixture.router.state.location.search,
            })),
          )
          .toEqual(
            mode === "page"
              ? { pathname: "/ai", search: type === "page" ? { p: id } : { d: id } }
              : { pathname: type === "page" ? `/p/${id}` : `/d/${id}`, search: {} },
          );
      }
    }
  });
}
