import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/scripts/editor/e2e/index.html");
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
});

const toc = (page) => page.getByTestId("main-pane").locator(".table-of-contents-block");

async function setContent(page, content) {
  await page.evaluate((content) => {
    window.readyEditors.main.chain().setContent(content).setMeta("addToHistory", false).run();
  }, content);
}

test("slash insertion creates a live outline with normalized nesting and an empty state", async ({
  page,
}) => {
  await setContent(page, "<p></p>");
  await page.getByTestId("main-pane").locator(".tiptap-editor").click();
  await page.keyboard.type("/toc");
  await page.getByRole("option", { name: /Table of contents/ }).click();
  await expect(toc(page)).toContainText("Add headings to create a table of contents.");
  await page.evaluate(() =>
    window.readyEditors.main.commands.insertContentAt(
      1,
      "<h2>Overview</h2><h3>Details</h3><h2>Next steps</h2><h3></h3>",
    ),
  );
  await expect(toc(page).getByRole("link")).toHaveText(["Overview", "Details", "Next steps"]);
  const indents = await toc(page)
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => parseFloat(getComputedStyle(link).marginInlineStart)),
    );
  expect(indents).toEqual([0, 24, 0]);
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    let heading;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading" && node.textContent === "Details") heading = { node, pos };
    });
    editor.commands.insertContentAt(
      { from: heading.pos + 1, to: heading.pos + heading.node.nodeSize - 1 },
      "Updated details",
    );
  });
  await expect(toc(page).getByRole("link")).toHaveText([
    "Overview",
    "Updated details",
    "Next steps",
  ]);
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    const tr = editor.state.tr;
    const headings = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading") headings.push({ node, pos });
    });
    for (const { node, pos } of headings.reverse()) tr.delete(pos, pos + node.nodeSize);
    editor.view.dispatch(tr);
  });
  await expect(toc(page).getByRole("link")).toHaveCount(0);
  await expect(toc(page)).toContainText("Add headings to create a table of contents.");
});

test("heading navigation works in editable and read-only panes without changing content", async ({
  page,
}) => {
  await setContent(
    page,
    '<div data-type="tableOfContentsBlock"></div><h1>Start</h1>' +
      "<p>Space between headings</p>".repeat(35) +
      "<h2>Destination</h2>",
  );
  await page.evaluate(() => {
    window.readyEditors.side.commands.setContent("<h1>Other page</h1>");
  });
  await expect(toc(page).getByRole("link")).toHaveText(["Start", "Destination"]);
  const before = await page.evaluate(() => window.readyEditors.main.getJSON());
  await toc(page).getByRole("link", { name: "Destination", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const editor = window.readyEditors.main;
        return editor.state.selection.$from.parent.textContent;
      }),
    )
    .toBe("Destination");
  await expect
    .poll(() => page.getByTestId("main-pane").evaluate((pane) => pane.scrollTop))
    .toBeGreaterThan(300);
  expect(await page.evaluate(() => window.readyEditors.main.getJSON())).toEqual(before);
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.setEditable(false);
    editor.view.dispatch(editor.state.tr.setMeta("editorCapabilities", true));
  });
  await toc(page).getByRole("link", { name: "Start", exact: true }).click();
  await expect
    .poll(() => page.getByTestId("main-pane").evaluate((pane) => pane.scrollTop))
    .toBeLessThan(300);
  expect(await page.evaluate(() => window.readyEditors.main.getJSON())).toEqual(before);
  expect(await page.getByTestId("side-pane").evaluate((pane) => pane.scrollTop)).toBe(0);
});

test("HTML, Markdown and JSON restore a dynamic block without persisting generated links", async ({
  page,
}) => {
  await setContent(
    page,
    '<div data-type="tableOfContentsBlock"></div><h1>Chapter</h1><h2>Section</h2>',
  );
  const serialized = await page.evaluate(() => {
    const editor = window.readyEditors.main;
    return { html: editor.getHTML(), markdown: editor.getMarkdown(), json: editor.getJSON() };
  });
  expect(serialized.html).toContain('<div data-type="tableOfContentsBlock"></div>');
  expect(serialized.html).not.toMatch(/<nav|<a|Add headings/);
  expect(serialized.markdown).toContain("[Table of contents]");
  for (const [content, contentType] of [
    [serialized.html, "html"],
    [serialized.markdown, "markdown"],
    [serialized.json, "json"],
  ]) {
    await page.evaluate(
      ({ content, contentType }) => {
        window.readyEditors.main.commands.setContent(content, { contentType });
      },
      { content, contentType },
    );
    await expect(toc(page)).toHaveCount(1);
    await expect(toc(page).getByRole("link")).toHaveText(["Chapter", "Section"]);
  }
});

test("plus insertion selects a movable block and supports undo and redo", async ({ page }) => {
  const pane = page.getByTestId("main-pane");
  await pane.locator(".tiptap-editor p").first().hover();
  await pane.getByRole("button", { name: "Add block below" }).click();
  await page.getByRole("option", { name: /Table of contents/ }).click();
  await expect(toc(page)).toBeVisible();
  expect(await page.evaluate(() => window.readyEditors.main.state.selection.node?.type.name)).toBe(
    "tableOfContentsBlock",
  );
  await page.evaluate(() => window.readyEditors.main.commands.undo());
  await expect(toc(page)).toHaveCount(0);
  await page.evaluate(() => window.readyEditors.main.commands.redo());
  await expect(toc(page)).toBeVisible();
});

test("Heading 4 can be inserted from the slash menu and deeper imported headings stay out of the TOC", async ({
  page,
}) => {
  await setContent(page, '<div data-type="tableOfContentsBlock"></div><p></p>');
  await page.getByTestId("main-pane").locator(".tiptap-editor p").click();
  await page.keyboard.type("/heading 4");
  await page.getByRole("option", { name: /Heading 4/ }).click();
  await page.keyboard.type("Fourth-level section");
  await expect(page.getByTestId("main-pane").getByRole("heading", { level: 4 })).toHaveText(
    "Fourth-level section",
  );
  await expect(toc(page).getByRole("link")).toHaveText(["Fourth-level section"]);
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.commands.insertContentAt(
      editor.state.doc.content.size,
      "<h5>Fifth level</h5><h6>Sixth level</h6>",
    );
  });
  await expect(toc(page).getByRole("link")).toHaveText(["Fourth-level section"]);
});

test("database and meeting titles update from shared data and navigate to their own blocks", async ({
  page,
}) => {
  await page.evaluate(() => {
    const timestamp = "2026-10-19T00:00:00.000Z";
    window.fixtureApiResponses.set("/databases/outline-db/bootstrap?includeDeleted=1", {
      viewerType: "public",
      database: {
        id: "outline-db",
        name: "Project tracker",
        accessLevel: "view",
        config: {},
        createdAt: timestamp,
        deletedAt: null,
        pageId: null,
        updatedAt: timestamp,
        version: 1,
        workspaceId: "outline-workspace",
      },
      dataSources: [],
      properties: [],
      views: [],
    });
    window.fixtureApiResponses.set("/meetings/outline-meeting", {
      meeting: { id: "outline-meeting", title: "Weekly review" },
    });
    const editor = window.readyEditors.main;
    const resourceView = ({ node }) => {
      const dom = document.createElement("div");
      dom.dataset.outlineResource = node.type.name;
      dom.style.minHeight = "400px";
      dom.textContent = node.type.name;
      return { dom };
    };
    editor.view.setProps({
      nodeViews: {
        ...editor.view.props.nodeViews,
        databaseBlock: resourceView,
        meetingBlock: resourceView,
      },
    });
  });
  await setContent(
    page,
    '<div data-type="tableOfContentsBlock"></div><h1>Overview</h1><h2>Section</h2><h3>Details</h3><h4>Subsection</h4><div data-type="databaseBlock" data-database-id="outline-db"></div><div data-type="meetingBlock" data-meeting-id="outline-meeting"></div>',
  );
  await expect(toc(page).getByRole("link")).toHaveText([
    "Overview",
    "Section",
    "Details",
    "Subsection",
    "Project tracker",
    "Weekly review",
  ]);
  const indents = await toc(page)
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => parseFloat(getComputedStyle(link).marginInlineStart)),
    );
  expect(indents).toEqual([0, 24, 48, 72, 24, 24]);
  await page.evaluate(async () => {
    const bootstrap = window.fixtureApiResponses.get(
      "/databases/outline-db/bootstrap?includeDeleted=1",
    );
    bootstrap.database.name = "Renamed tracker";
    bootstrap.database.version++;
    window.fixtureApiResponses.set("/meetings/outline-meeting", {
      meeting: { id: "outline-meeting", title: "Renamed review" },
    });
    await window.invalidateFixtureQueries();
  });
  await expect(toc(page).getByRole("link", { name: "Renamed tracker" })).toBeVisible();
  await expect(toc(page).getByRole("link", { name: "Renamed review" })).toBeVisible();
  const before = await page.evaluate(() => window.readyEditors.main.getJSON());
  await toc(page).getByRole("link", { name: "Renamed review" }).click();
  await expect
    .poll(() => page.getByTestId("main-pane").evaluate((pane) => pane.scrollTop))
    .toBeGreaterThan(300);
  expect(await page.evaluate(() => window.readyEditors.main.getJSON())).toEqual(before);
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    const positions = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "meetingBlock") positions.push(pos);
    });
    editor.commands.deleteRange({ from: positions[0], to: positions[0] + 1 });
  });
  await expect(toc(page).getByRole("link", { name: "Renamed review" })).toHaveCount(0);
});
