import { test, expect } from "@playwright/test";

const paragraph = (text = "") => ({
  type: "paragraph",
  content: text ? [{ type: "text", text }] : [],
});
const panel = (title, content = [paragraph()]) => ({ type: "tabPanel", attrs: { title }, content });
const tabs = (...content) => ({ type: "tabsBlock", content });
const main = (page) => page.getByTestId("main-pane");
const block = (page) => main(page).locator(".editor-tabs").first();
async function setDocument(page, content) {
  await page.evaluate(
    (content) =>
      window.readyEditors.main
        .chain()
        .setContent({ type: "doc", content })
        .setMeta("addToHistory", false)
        .run(),
    content,
  );
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api.zilobase.test/**", (route) => route.fulfill({ json: {} }));
  await page.goto("/scripts/editor/e2e/index.html");
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
});

test("slash Tabs creates database-style controls and independent nested content", async ({
  page,
}) => {
  await setDocument(page, [paragraph()]);
  await main(page).locator(".tiptap-editor > p").first().click();
  await page.keyboard.type("/tabs");
  await expect(page.getByRole("option", { name: /^Tabs/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(block(page).getByRole("tab")).toHaveCount(3);
  await expect(block(page).getByRole("tab", { name: "Tab 1", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(block(page).getByRole("tab").first()).toHaveAttribute("data-slot", "tabs-tab");
  await expect(block(page).getByRole("tab").first()).toHaveCSS("height", "28px");
  await page.keyboard.type("First tab");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Another block");
  await block(page).getByRole("tab", { name: "Tab 2", exact: true }).click();
  await expect(block(page).locator(".editor-tab-panel:visible")).toHaveCount(1);
  await block(page).locator(".editor-tab-panel:visible p").click();
  await page.keyboard.type("Second tab");
  await block(page).getByRole("tab", { name: "Tab 1", exact: true }).click();
  await expect(block(page).locator(".editor-tab-panel:visible")).toHaveText(
    "First tabAnother block",
  );
  await block(page).locator(".editor-tab-panel:visible p").last().click();
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.type("Outside");
  expect(await page.evaluate(() => window.readyEditors.main.getJSON().content[1])).toMatchObject(
    paragraph("Outside"),
  );
});

test("tabs retain hidden mixed blocks across HTML and JSON reloads and keyboard navigation", async ({
  page,
}) => {
  await setDocument(page, [
    tabs(
      panel("Overview", [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Heading" }] },
        paragraph("Details"),
        { type: "callout", attrs: { icon: "🚀" }, content: [paragraph("Nested callout")] },
      ]),
      panel("Code", [
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [{ type: "text", text: "const n = 1;" }],
        },
        {
          type: "table",
          content: [
            { type: "tableRow", content: [{ type: "tableCell", content: [paragraph("Cell")] }] },
          ],
        },
      ]),
      panel("Nested", [
        tabs(panel("Inner", [paragraph("Deep content")]), panel("Other", [paragraph("More")])),
      ]),
    ),
  ]);
  const result = await page.evaluate(() => {
    const editor = window.readyEditors.main;
    const before = editor.state.doc.firstChild;
    const html = editor.getHTML();
    editor.commands.setContent(html);
    const htmlMatches = editor.state.doc.firstChild.eq(before);
    editor.commands.setContent(editor.getJSON());
    return { html, htmlMatches, jsonMatches: editor.state.doc.firstChild.eq(before) };
  });
  expect(result.htmlMatches).toBe(true);
  expect(result.jsonMatches).toBe(true);
  expect(result.html).not.toContain("Add tab");
  expect(result.html).not.toContain("hidden");
  await block(page).getByRole("tab", { name: "Overview", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(block(page).getByRole("tab", { name: "Code", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(block(page).getByRole("tab", { name: "Code", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(block(page).locator(".editor-tab-panel:visible").first().locator("code")).toHaveText(
    "const n = 1;",
  );
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await block(page).screenshot({ path: test.info().outputPath("tabs-dark.png") });
  await block(page).getByRole("tab", { name: "Nested", exact: true }).click();
  await expect(block(page).getByText("Deep content", { exact: true })).toBeVisible();
  await block(page).getByRole("tab", { name: "Other", exact: true }).click();
  await expect(block(page).getByText("More", { exact: true })).toBeVisible();
});

test("add rename delete and undo preserve other tab contents and read-only navigation", async ({
  page,
}) => {
  await setDocument(page, [
    tabs(panel("First", [paragraph("Keep")]), panel("Second", [paragraph("Two")])),
  ]);
  await block(page).getByRole("button", { name: "Add tab", exact: true }).click();
  await expect(block(page).getByRole("tab")).toHaveCount(3);
  await block(page).getByRole("tab", { selected: true }).first().click();
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await page.getByLabel("Tab name", { exact: true }).fill("Renamed");
  await page.keyboard.press("Enter");
  await expect(block(page).getByRole("tab", { name: "Renamed", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Escape");
  await block(page).locator(".editor-tab-panel:visible p").click();
  await page.keyboard.type("Remove me");
  const before = await page.evaluate(() => window.readyEditors.main.getJSON());
  await block(page).getByRole("tab", { selected: true }).first().click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(block(page).getByRole("tab")).toHaveCount(2);
  await page.evaluate(() => window.readyEditors.main.commands.undo());
  expect(await page.evaluate(() => window.readyEditors.main.getJSON())).toEqual(before);
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.setEditable(false);
    editor.view.dispatch(editor.state.tr.setMeta("capabilities", true));
  });
  await expect(block(page).getByRole("button", { name: "Add tab", exact: true })).toHaveCount(0);
  await block(page).getByRole("tab", { name: "First", exact: true }).click();
  await expect(block(page).getByText("Keep", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.readyEditors.main.commands.insertTabs())).toBe(false);
  expect(await page.evaluate(() => window.readyEditors.main.getJSON())).toEqual(before);
});

test("native drag inserts blocks into the active panel and paired undo restores both editors", async ({
  page,
}) => {
  await setDocument(page, [
    tabs(panel("First", [paragraph("Destination")]), panel("Hidden", [paragraph("Leave alone")])),
  ]);
  await page.evaluate(() =>
    window.readyEditors.side.commands.setContent("<p>Dragged block</p><p>Keep source</p>"),
  );
  const side = page.getByTestId("side-pane");
  await side
    .locator(".tiptap-editor p")
    .first()
    .hover({ position: { x: 5, y: 10 } });
  await side
    .getByRole("button", { name: "Open block actions", exact: true })
    .dragTo(block(page).locator(".editor-tab-panel:visible p"));
  await expect(block(page).locator(".editor-tab-panel:visible")).toContainText("Dragged block");
  await expect(side.locator(".tiptap-editor")).not.toContainText("Dragged block");
  await page.evaluate(() => window.mountedUndo());
  await expect(side.locator(".tiptap-editor")).toContainText("Dragged block");
  await expect(block(page).locator(".editor-tab-panel:visible")).not.toContainText("Dragged block");
});

test("Turn into Tabs wraps existing blocks without flattening and remains undoable", async ({
  page,
}) => {
  await setDocument(page, [paragraph("Keep this"), paragraph("Outside")]);
  await main(page)
    .locator(".tiptap-editor > p")
    .first()
    .hover({ position: { x: 5, y: 10 } });
  await main(page).getByRole("button", { name: "Open block actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Turn into", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Tabs", exact: true }).click();
  await expect(block(page).locator(".editor-tab-panel:visible")).toHaveText("Keep this");
  await page.evaluate(() => window.readyEditors.main.commands.undo());
  await expect(main(page).locator(".editor-tabs")).toHaveCount(0);
  await expect(main(page).locator(".tiptap-editor > p").first()).toHaveText("Keep this");
});

test("tab choices are isolated between editors and survive edits before the block", async ({
  page,
}) => {
  const doc = [
    paragraph("Before"),
    tabs(panel("One", [paragraph("First content")]), panel("Two", [paragraph("Second content")])),
  ];
  await setDocument(page, doc);
  await page.evaluate(
    (content) => window.readyEditors.side.commands.setContent({ type: "doc", content }),
    doc,
  );
  const side = page.getByTestId("side-pane");
  await block(page).getByRole("tab", { name: "Two", exact: true }).click();
  await expect(side.getByText("First content", { exact: true })).toBeVisible();
  await expect(block(page).getByText("Second content", { exact: true })).toBeVisible();
  await main(page).locator(".tiptap-editor > p").first().click();
  await page.keyboard.type("More text ");
  await expect(block(page).getByRole("tab", { name: "Two", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const ids = await page
    .locator('.editor-tabs [role="tab"]')
    .evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(new Set(ids).size).toBe(ids.length);
  await page.setViewportSize({ width: 650, height: 850 });
  await expect(block(page).getByRole("tab", { name: "Two", exact: true })).toBeVisible();
  await block(page).screenshot({ path: test.info().outputPath("tabs-light-narrow.png") });
});

test("the last tab cannot be removed and tab navigation does not add undo steps", async ({
  page,
}) => {
  await setDocument(page, [tabs(panel("Only", [paragraph("Keep")]))]);
  await block(page).getByRole("tab", { selected: true }).first().click();
  await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await block(page).getByRole("button", { name: "Add tab", exact: true }).click();
  await block(page).getByRole("tab", { name: "Only", exact: true }).click();
  await page.evaluate(() => window.readyEditors.main.commands.undo());
  await expect(block(page).getByRole("tab")).toHaveCount(1);
  await expect(block(page).getByText("Keep", { exact: true })).toBeVisible();
});

test("dragging the Tabs container moves every panel together", async ({ page }) => {
  await setDocument(page, [
    tabs(panel("First", [paragraph("Visible")]), panel("Second", [paragraph("Hidden content")])),
  ]);
  await page.evaluate(() => window.readyEditors.side.commands.setContent("<p>Destination</p>"));
  await expect(block(page).getByRole("tab")).toHaveCount(2);
  await block(page).hover({ position: { x: 5, y: 6 } });
  await main(page)
    .getByRole("button", { name: "Open block actions", exact: true })
    .dragTo(page.getByTestId("side-pane").locator(".tiptap-editor > p").first());
  await expect(main(page).locator(".editor-tabs")).toHaveCount(0);
  const moved = page.getByTestId("side-pane").locator(".editor-tabs");
  await expect(moved.getByRole("tab")).toHaveCount(2);
  await moved.getByRole("tab", { name: "Second", exact: true }).click();
  await expect(moved.getByText("Hidden content", { exact: true })).toBeVisible();
  await page.evaluate(() => window.mountedUndo());
  await expect(block(page).getByRole("tab")).toHaveCount(2);
  await expect(page.getByTestId("side-pane").locator(".editor-tabs")).toHaveCount(0);
});

test("the plus menu inserts Tabs and focuses its first panel", async ({ page }) => {
  await setDocument(page, [paragraph("Before")]);
  await main(page)
    .locator(".tiptap-editor > p")
    .first()
    .hover({ position: { x: 5, y: 10 } });
  await main(page).getByRole("button", { name: "Add block below", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Insert block", exact: true })
    .getByRole("option", { name: /^Tabs/ })
    .click();
  await expect(block(page).getByRole("tab", { name: "Tab 1", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.type("First panel");
  await expect(block(page).locator(".editor-tab-panel:visible")).toHaveText("First panel");
  expect(
    await page.evaluate(() => window.readyEditors.main.getJSON().content[0].content[0].text),
  ).toBe("Before");
});

test("empty tab names keep their fallback label through HTML reloads", async ({ page }) => {
  await setDocument(page, [tabs(panel("", [paragraph("Named by fallback")]))]);
  const same = await page.evaluate(() => {
    const editor = window.readyEditors.main;
    const before = editor.state.doc.firstChild;
    editor.commands.setContent(editor.getHTML());
    return editor.state.doc.firstChild.eq(before);
  });
  expect(same).toBe(true);
  await expect(block(page).getByRole("tab", { name: "Tab 1", exact: true })).toBeVisible();
});

test("scrolling tab lists keep the same corners on first middle and last tabs", async ({
  page,
}) => {
  await setDocument(page, [tabs(panel("First"), panel("Middle"), panel("Last"))]);
  await expect(block(page).getByRole("button", { name: "Tab settings" })).toHaveCount(0);
  for (const dark of [false, true]) {
    await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), dark);
    for (const name of ["First", "Middle", "Last"]) {
      const tab = block(page).getByRole("tab", { name, exact: true });
      if (!(await tab.getAttribute("aria-selected")).includes("true")) await tab.click();
      await tab.hover();
      const corners = await tab.evaluate((el) => {
        const s = getComputedStyle(el);
        return [
          s.borderTopLeftRadius,
          s.borderTopRightRadius,
          s.borderBottomLeftRadius,
          s.borderBottomRightRadius,
        ];
      });
      expect(new Set(corners).size).toBe(1);
      expect(corners[0]).toBe("6px");
    }
    await expect(block(page).locator('[data-slot="tabs-list"]')).toHaveCSS("border-radius", "0px");
    await block(page).screenshot({
      path: test.info().outputPath(dark ? "tab-corners-dark.png" : "tab-corners-light.png"),
    });
  }
});

test("active tabs open their dropdown and inactive tabs only switch", async ({ page }) => {
  await setDocument(page, [tabs(panel("First"), panel("Second"))]);
  await block(page).getByRole("tab", { name: "Second", exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await block(page).getByRole("tab", { name: "Second", exact: true }).click();
  await expect(page.getByRole("menuitem")).toHaveText([
    "Copy link",
    "Rename",
    "Edit icon",
    "Delete",
  ]);
  await page.keyboard.press("Escape");
  await expect(block(page).getByRole("tab", { name: "Second", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Copy link", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await block(page).getByRole("tab", { name: "First", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(block(page).getByRole("tab", { name: "First", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("tab icons use the shared picker and persist through reload", async ({ page }) => {
  await setDocument(page, [tabs(panel("First", [paragraph("Keep text")]), panel("Second"))]);
  await block(page).getByRole("tab", { selected: true }).click();
  await page.getByRole("menuitem", { name: "Edit icon", exact: true }).click();
  await page.getByRole("tab", { name: "Icon", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Icon", exact: true }).locator("..")).toHaveCSS(
    "border-radius",
    "0px",
  );
  await page.getByPlaceholder("Search Phosphor icons...").fill("rocket");
  await page.getByRole("button", { name: "Rocket", exact: true }).click();
  await page.getByRole("button", { name: "Rocket in Blue", exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(
    block(page).getByRole("tab", { name: "First", exact: true }).locator("svg"),
  ).toHaveCount(1);
  const before = await page.evaluate(() => window.readyEditors.main.getJSON());
  expect(before.content[0].content[0].attrs.icon).toContain("<svg");
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.commands.setContent(editor.getHTML());
  });
  expect(await page.evaluate(() => window.readyEditors.main.getJSON())).toEqual(before);
  await block(page).getByRole("tab", { selected: true }).click();
  await page.getByRole("menuitem", { name: "Edit icon", exact: true }).click();
  await page.getByRole("button", { name: "Remove icon", exact: true }).click();
  await expect(
    block(page).getByRole("tab", { name: "First", exact: true }).locator("svg"),
  ).toHaveCount(0);
  await expect(block(page).locator(".editor-tab-panel:visible")).toHaveText("Keep text");
});

test("copied tab links reveal the correct panel after reload without moving the caret while typing", async ({
  page,
}) => {
  await setDocument(page, [
    tabs(panel("First", [paragraph("One")]), panel("Second", [paragraph("Two")])),
  ]);
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async (text) => {
        window.copiedTabLink = text;
      },
    }),
  );
  await block(page).getByRole("tab", { name: "Second", exact: true }).click();
  await block(page).getByRole("tab", { name: "Second", exact: true }).click();
  await page.getByRole("menuitem", { name: "Copy link", exact: true }).click();
  await expect(page.getByText("Tab link copied.", { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => ({
    doc: window.readyEditors.main.getJSON(),
    url: window.copiedTabLink,
  }));
  expect(new URL(saved.url).hash).toBe(
    `#editor-tab=${saved.doc.content[0].content[1].attrs.tabId}`,
  );
  await page.evaluate((url) => {
    window.history.replaceState(null, "", url);
  }, saved.url);
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await setDocument(page, saved.doc.content);
  await expect(block(page).getByRole("tab", { name: "Second", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await block(page).locator(".editor-tab-panel:visible p").click();
  await page.keyboard.press("End");
  await page.keyboard.type("ABC");
  await expect(block(page).locator(".editor-tab-panel:visible p")).toHaveText("TwoABC");
  const ids = await page.evaluate(() => {
    const editor = window.readyEditors.main;
    const duplicated = editor.state.doc.firstChild.toJSON();
    editor.commands.insertContentAt(editor.state.doc.content.size, duplicated);
    const ids = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "tabPanel") ids.push(node.attrs.tabId);
    });
    return ids;
  });
  expect(new Set(ids).size).toBe(ids.length);
});

test("read-only tab dropdowns allow links and disable mutations", async ({ page }) => {
  await setDocument(page, [tabs(panel("First"), panel("Second"))]);
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.setEditable(false);
    editor.view.dispatch(editor.state.tr.setMeta("capabilities", true));
  });
  const before = await page.evaluate(() => window.readyEditors.main.getJSON());
  await block(page).getByRole("tab", { selected: true }).click();
  await expect(page.getByRole("menuitem", { name: "Copy link", exact: true })).toBeEnabled();
  for (const name of ["Rename", "Edit icon", "Delete"])
    await expect(page.getByRole("menuitem", { name, exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.readyEditors.main.getJSON())).toEqual(before);
});

test("nested tab links reveal their parents and clipboard failures show feedback", async ({
  page,
}) => {
  await setDocument(page, [
    tabs(
      panel("Front"),
      panel("Back", [tabs(panel("Inner one"), panel("Inner two", [paragraph("Nested target")]))]),
    ),
  ]);
  const target = await page.evaluate(
    () =>
      window.readyEditors.main.getJSON().content[0].content[1].content[0].content[1].attrs.tabId,
  );
  await page.evaluate((id) => {
    window.location.hash = `editor-tab=${encodeURIComponent(id)}`;
  }, target);
  await expect(block(page).getByText("Nested target", { exact: true })).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async () => {
        throw new Error("Clipboard denied");
      },
    }),
  );
  await block(page).getByRole("tab", { name: "Inner two", exact: true }).click();
  await page.getByRole("menuitem", { name: "Copy link", exact: true }).click();
  await expect(page.getByText("Could not copy tab link.", { exact: true })).toBeVisible();
});
