import { test, expect } from "@playwright/test";

const paragraph = (text) => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
const callout = (content, icon = "💡") => ({ type: "callout", attrs: { icon }, content });
const main = (page) => page.getByTestId("main-pane");
const content = (page) => main(page).locator(".editor-callout-content").first();

async function setDocument(page, nodes) {
  await page.evaluate(
    (nodes) =>
      window.readyEditors.main
        .chain()
        .setContent({ type: "doc", content: nodes })
        .setMeta("addToHistory", false)
        .run(),
    nodes,
  );
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api.zilobase.test/**", (route) => route.fulfill({ json: {} }));
  await page.goto("/scripts/editor/e2e/index.html");
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
});

test("slash Callout creates an indented editable container and Mod-Enter exits it", async ({
  page,
}) => {
  await setDocument(page, [paragraph("")]);
  await main(page).locator(".tiptap-editor > p").first().click();
  await page.keyboard.type("/callout");
  await expect(page.getByRole("option", { name: /Callout/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(main(page).locator(".editor-callout")).toHaveCount(1);
  await expect(main(page).getByRole("button", { name: "Change callout icon" })).toContainText("💡");
  await page.keyboard.type("Remember this");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Another block");
  await expect(content(page).locator("p")).toHaveCount(2);
  const icon = await main(page).getByRole("button", { name: "Change callout icon" }).boundingBox();
  const text = await content(page).boundingBox();
  expect(text.x).toBeGreaterThan(icon.x + icon.width);
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.type("Outside");
  const doc = await page.evaluate(() => window.readyEditors.main.getJSON());
  expect(doc.content[0].type).toBe("callout");
  expect(doc.content[0].content.map((node) => node.content[0].text)).toEqual([
    "Remember this",
    "Another block",
  ]);
  expect(doc.content[1]).toMatchObject(paragraph("Outside"));
});

test("callouts retain mixed nested blocks and icons across HTML and JSON reloads", async ({
  page,
}) => {
  const nested = callout(
    [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Release notes" }] },
      paragraph("Details"),
      { type: "bulletList", content: [{ type: "listItem", content: [paragraph("First item")] }] },
      {
        type: "codeBlock",
        attrs: { language: "js" },
        content: [{ type: "text", text: "const ready = true;" }],
      },
      {
        type: "table",
        content: [
          { type: "tableRow", content: [{ type: "tableCell", content: [paragraph("Cell")] }] },
        ],
      },
      { type: "horizontalRule" },
      callout([paragraph("Nested note")], "📌"),
      { type: "fileBlock" },
    ],
    "🚀",
  );
  await setDocument(page, [nested]);
  await expect(main(page).locator(".editor-callout")).toHaveCount(2);
  await expect(content(page).getByRole("heading", { name: "Release notes" })).toBeVisible();
  await expect(content(page).locator("code")).toHaveText("const ready = true;");
  const result = await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.state.doc.check();
    const before = editor.state.doc.firstChild;
    const html = editor.getHTML();
    editor.commands.setContent(html);
    editor.state.doc.check();
    const htmlMatches = editor.state.doc.firstChild.eq(before);
    const json = editor.getJSON();
    editor.commands.setContent(json);
    return { htmlMatches, jsonMatches: editor.state.doc.firstChild.eq(before), html };
  });
  expect(result.htmlMatches).toBe(true);
  expect(result.jsonMatches).toBe(true);
  expect(result.html).toContain('data-callout-icon="🚀"');
  expect(result.html).not.toContain("Change callout icon");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await main(page)
    .locator(".editor-callout")
    .first()
    .screenshot({ path: test.info().outputPath("callout-dark.png") });
});

test("callout handle colors fill the container, default to Gray, and preserve Default as no fill", async ({
  page,
}) => {
  await setDocument(page, [callout([paragraph("Colored callout")])]);
  const block = main(page).locator(".editor-callout");
  const openColors = async () => {
    await main(page)
      .getByText("Colored callout", { exact: true })
      .hover({ position: { x: 8, y: 10 } });
    await main(page).getByRole("button", { name: "Open block actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Color", exact: true }).hover();
  };
  const matchesToken = (variable) =>
    block.evaluate((el, variable) => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = `var(${variable})`;
      document.body.append(probe);
      const matches =
        getComputedStyle(el).backgroundColor === getComputedStyle(probe).backgroundColor;
      probe.remove();
      return matches;
    }, variable);
  await expect(block).toHaveAttribute("data-background-color", "gray");
  await expect.poll(() => matchesToken("--zb-color-surface-background-navigation")).toBe(true);
  await openColors();
  await expect(page.getByRole("button", { name: /^Gray background/ })).toContainText("Selected");
  await expect(page.getByRole("button", { name: /^Default background/ })).not.toContainText(
    "Selected",
  );
  await page.getByRole("button", { name: /^Blue background/ }).click();
  await expect(block).toHaveAttribute("data-background-color", "blue");
  await expect.poll(() => matchesToken("--zb-color-palette-background-blue-subtle")).toBe(true);
  expect(
    await page.evaluate(
      () => window.readyEditors.main.getJSON().content[0].content[0].content[0].marks ?? [],
    ),
  ).toEqual([]);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect.poll(() => matchesToken("--zb-color-palette-background-blue-subtle")).toBe(true);
  await openColors();
  await expect(page.getByRole("button", { name: /^Blue background/ })).toContainText("Selected");
  await page.getByRole("button", { name: /^Default background/ }).click();
  await expect(block).toHaveAttribute("data-background-color", "default");
  await expect(block).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const roundTrip = await page.evaluate(() => {
    const editor = window.readyEditors.main;
    const html = editor.getHTML();
    editor.commands.setContent(html);
    const fromHtml = editor.state.doc.firstChild.attrs.backgroundColor;
    editor.commands.setContent(editor.getJSON());
    return { html, fromHtml, fromJson: editor.state.doc.firstChild.attrs.backgroundColor };
  });
  expect(roundTrip.html).toContain('data-background-color="default"');
  expect(roundTrip.fromHtml).toBe("default");
  expect(roundTrip.fromJson).toBe("default");
  await openColors();
  await expect(page.getByRole("button", { name: /^Default background/ })).toContainText("Selected");
  await page.getByRole("button", { name: /^Gray background/ }).click();
  await expect.poll(() => matchesToken("--zb-color-surface-background-navigation")).toBe(true);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(block).toHaveAttribute("data-background-color", "default");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(block).toHaveAttribute("data-background-color", "gray");
});

test("callouts use the shared icon picker and respect read-only changes", async ({ page }) => {
  await setDocument(page, [callout([paragraph("Keep content")])]);
  const icon = main(page).getByRole("button", { name: "Change callout icon" });
  await icon.click();
  await page.getByRole("tab", { name: "Icon", exact: true }).click();
  await page.getByPlaceholder("Search Phosphor icons...").fill("rocket");
  await page.getByRole("button", { name: "Rocket", exact: true }).click();
  await page.getByRole("button", { name: "Rocket in Blue", exact: true }).click();
  await expect(page.getByPlaceholder("Search Phosphor icons...")).toHaveCount(0);
  expect(
    await page.evaluate(() => window.readyEditors.main.getJSON().content[0].attrs.icon),
  ).toContain("<svg");
  await expect(icon.locator("svg")).toHaveCount(1);
  await expect(content(page)).toHaveText("Keep content");
  await page.evaluate(() => {
    window.readyEditors.main.setEditable(false);
    window.readyEditors.main.view.dispatch(
      window.readyEditors.main.state.tr.setMeta("editorCapabilities", true),
    );
  });
  await expect(icon).toBeDisabled();
  await expect(content(page)).toHaveText("Keep content");
});

test("native block dragging inserts into callout contents and paired undo restores it", async ({
  page,
}) => {
  await setDocument(page, [callout([paragraph("Keep")])]);
  await page.evaluate(() =>
    window.readyEditors.side.commands.setContent({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Moved block" }] }],
    }),
  );
  const side = page.getByTestId("side-pane");
  await side
    .locator(".tiptap-editor p")
    .first()
    .hover({ position: { x: 5, y: 10 } });
  await side
    .getByRole("button", { name: "Open block actions", exact: true })
    .dragTo(content(page).locator("p"));
  await expect(content(page)).toContainText("Moved block");
  await expect(side.locator(".tiptap-editor")).not.toContainText("Moved block");
  expect(
    await page.evaluate(() =>
      window.readyEditors.main
        .getJSON()
        .content[0].content.some((node) => node.content?.[0]?.text === "Moved block"),
    ),
  ).toBe(true);
  await page.evaluate(() => window.mountedUndo());
  await expect(content(page)).toHaveText("Keep");
  await expect(side.locator(".tiptap-editor")).toContainText("Moved block");
});

test("Turn into Callout preserves text formatting and is undoable", async ({ page }) => {
  await page.evaluate(() =>
    window.readyEditors.main.commands.setContent("<p>A <strong>bold</strong> note</p>"),
  );
  await main(page)
    .locator(".tiptap-editor > p")
    .first()
    .hover({ position: { x: 25, y: 10 } });
  await main(page).getByRole("button", { name: "Open block actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Turn into", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Callout", exact: true }).click();
  await expect(content(page)).toHaveText("A bold note");
  await expect(content(page).locator("strong")).toHaveText("bold");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(main(page).locator(".editor-callout")).toHaveCount(0);
  await expect(main(page).locator("strong")).toHaveText("bold");
});
