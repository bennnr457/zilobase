import { test, expect } from "@playwright/test";
test("StrictMode document replacement keeps editor chrome bound to the live instance", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  const main = page.getByTestId("main-pane");
  for (let replacement = 0; replacement < 2; replacement++) {
    await page.getByRole("button", { name: "Replace main document" }).click();
    await expect(main.locator(".tiptap-editor")).toContainText("Collaborative replacement");
    await main
      .locator(".tiptap-editor p")
      .first()
      .hover({ position: { x: 5, y: 10 } });
    await expect(main.getByLabel("Open block actions")).toBeVisible();
  }
  await main.locator('[contenteditable="true"]').first().click();
  await page.keyboard.type(" works");
  await expect(main.locator(".tiptap-editor")).toContainText("works");
  expect(errors).toEqual([]);
});
test.beforeEach(async ({ page }) => {
  await page.route("**/api.zilobase.test/**", (route) => route.fulfill({ json: {} }));
  await page.goto("/scripts/editor/e2e/index.html");
});
test("handle aligns on first hover in each positioned pane and follows its scroll", async ({
  page,
}) => {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  for (const paneId of ["main-pane", "side-pane"]) {
    const pane = page.getByTestId(paneId);
    const block = pane.locator(".tiptap-editor p").first();
    await block.hover({ position: { x: 25, y: 10 } });
    const handle = pane.locator(".drag-handle");
    await expect(handle).toBeVisible();
    await expect
      .poll(async () => {
        const editor = pane.locator(".tiptap-editor");
        const editorRect = await editor.boundingBox();
        const handleRect = await handle.boundingBox();
        const padding = await editor.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
        return Math.abs(handleRect.x + handleRect.width - editorRect.x - padding);
      })
      .toBeLessThan(2);
    await expect
      .poll(async () => {
        const blockRect = await block.boundingBox();
        const handleRect = await handle.boundingBox();
        const inset = await block.evaluate(
          (el) =>
            parseFloat(getComputedStyle(el).paddingTop) +
            (parseFloat(getComputedStyle(el).lineHeight) - 28) / 2,
        );
        return Math.abs(handleRect.y - blockRect.y - inset);
      })
      .toBeLessThan(2);
  }
  const pane = page.getByTestId("side-pane");
  await pane.evaluate((el) => {
    el.style.height = "120px";
  });
  const block = pane.locator(".tiptap-editor p").first();
  await pane.evaluate((el) => {
    el.scrollTop = 20;
  });
  await expect
    .poll(async () => {
      const blockRect = await block.boundingBox();
      const handleRect = await pane.locator(".drag-handle").boundingBox();
      const inset = await block.evaluate(
        (el) =>
          parseFloat(getComputedStyle(el).paddingTop) +
          (parseFloat(getComputedStyle(el).lineHeight) - 28) / 2,
      );
      return Math.abs(handleRect.y - blockRect.y - inset);
    })
    .toBeLessThan(2);
});
test("real local and Yjs editors transfer, compensate, preserve comments, map anchors and pair history", async ({
  page,
}) => {
  await expect.poll(() => page.evaluate(() => typeof window.runScenarios)).toBe("function");
  expect(await page.evaluate(() => window.runScenarios())).toBe("passed");
});
test("replacement editor composition preserves view identity on promotion and isolates typing renders", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  const main = page.getByTestId("main-pane").locator('[contenteditable="true"]').first();
  await main.click();
  const renders = await page.evaluate(() => window.shellRenders());
  await page.keyboard.type("Hello");
  expect(await page.evaluate(() => window.shellRenders())).toBe(renders);
  const identity = await page.evaluate(() => {
    window.savedSideEditor = window.readyEditors.side;
    return window.readyEditors.side.state.doc.textContent;
  });
  await page.getByRole("button", { name: "Promote side pane" }).click();
  expect(await page.evaluate(() => window.savedSideEditor === window.readyEditors.side)).toBe(true);
  expect(await page.evaluate(() => window.readyEditors.side.state.doc.textContent)).toBe(identity);
  expect(errors).toEqual([]);
});

test("official native drag attaches MIME after serialization and consumes one pane transfer", async ({
  page,
}) => {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await page.evaluate(() => {
    window.nativeDragPayload = null;
    document.addEventListener("dragstart", (event) => {
      window.nativeDragPayload = {
        types: [...event.dataTransfer.types],
        html: event.dataTransfer.getData("text/html"),
        payload: event.dataTransfer.getData("application/x-zilobase-editor-block-drag"),
      };
    });
  });
  const main = page.getByTestId("main-pane"),
    side = page.getByTestId("side-pane");
  await main
    .locator(".tiptap-editor p")
    .first()
    .hover({ position: { x: 5, y: 10 } });
  const grip = main.getByLabel("Open block actions");
  await expect(grip).toBeVisible();
  await grip.dragTo(side.locator(".tiptap-editor p").last());
  const data = await page.evaluate(() => ({
    drag: window.nativeDragPayload,
    main: window.readyEditors.main.state.doc.textContent,
    side: window.readyEditors.side.state.doc.textContent,
  }));
  expect(data.drag.types).toContain("application/x-zilobase-editor-block-drag");
  expect(data.drag.html).toContain("Main one");
  expect(data.main).toBe("Main two");
  expect(data.side.match(/Main one/g)).toHaveLength(1);
  await page.evaluate(() => window.mountedUndo());
  expect(await page.evaluate(() => window.readyEditors.main.state.doc.textContent)).toBe(
    "Main oneMain two",
  );
});

test("official handle preserves a multiple-block selection and copy modifier", async ({ page }) => {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 });
  });
  const main = page.getByTestId("main-pane"),
    side = page.getByTestId("side-pane");
  await main
    .locator(".tiptap-editor p")
    .first()
    .hover({ position: { x: 5, y: 10 } });
  const modifier = await page.evaluate(() => (/Mac/.test(navigator.platform) ? "Alt" : "Control"));
  await page.keyboard.down(modifier);
  await main.getByLabel("Open block actions").dragTo(side.locator(".tiptap-editor p").last());
  await page.keyboard.up(modifier);
  expect(await page.evaluate(() => window.readyEditors.main.state.doc.textContent)).toBe(
    "Main oneMain two",
  );
  const text = await page.evaluate(() => window.readyEditors.side.state.doc.textContent);
  expect(text.match(/Main one/g)).toHaveLength(1);
  expect(text.match(/Main two/g)).toHaveLength(1);
});

test("rejected and malformed internal drops are consumed without plain-text fallback", async ({
  page,
}) => {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  const result = await page.evaluate(() => {
    const editor = window.readyEditors.side,
      before = editor.state.doc.textContent;
    const drop = () => {
      const transfer = new DataTransfer();
      transfer.setData("application/x-zilobase-editor-block-drag", "{}");
      transfer.setData("text/plain", "must never insert");
      const rect = editor.view.dom.getBoundingClientRect();
      const event = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX: rect.left + 100,
        clientY: rect.top + 30,
      });
      editor.view.dom.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const editableConsumed = drop();
    editor.setEditable(false, false);
    const readOnlyConsumed = drop();
    return { editableConsumed, readOnlyConsumed, before, after: editor.state.doc.textContent };
  });
  expect(result.editableConsumed).toBe(true);
  expect(result.readOnlyConsumed).toBe(true);
  expect(result.after).toBe(result.before);
});

test("nested list items transfer through the official nested handle", async ({ page }) => {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await page.evaluate(() =>
    window.readyEditors.main.commands.setContent(
      "<ul><li><p>Outer</p><ul><li><p>Nested</p></li></ul></li><li><p>Other</p></li></ul>",
    ),
  );
  const main = page.getByTestId("main-pane"),
    side = page.getByTestId("side-pane");
  await main.locator("li li p").hover({ position: { x: 5, y: 10 } });
  await main.getByLabel("Open block actions").dragTo(side.locator(".tiptap-editor p").last());
  expect(await page.evaluate(() => window.readyEditors.main.state.doc.textContent)).toBe(
    "OuterOther",
  );
  expect(
    (await page.evaluate(() => window.readyEditors.side.state.doc.textContent)).match(/Nested/g),
  ).toHaveLength(1);
});

test("database header exposes an aligned handle and drags the whole block", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await page.evaluate(() =>
    window.readyEditors.main.commands.setContent({
      type: "doc",
      content: [
        { type: "databaseBlock", attrs: { databaseId: null, showTitle: true } },
        { type: "paragraph" },
      ],
    }),
  );
  const main = page.getByTestId("main-pane");
  const title = main.getByRole("textbox", { name: "Database title", exact: true });
  await title.hover();
  const handle = main.locator(".drag-handle");
  await expect(handle).toBeVisible();
  await expect
    .poll(async () => {
      const headerRect = await main.locator(".database-toolbar > div").first().boundingBox();
      const handleRect = await handle.boundingBox();
      return Math.abs(handleRect.y + handleRect.height / 2 - headerRect.y - headerRect.height / 2);
    })
    .toBeLessThan(2);
  await main.getByLabel("Open block actions").click();
  await expect(page.getByText("Turn into", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await title.hover();
  await main
    .getByLabel("Open block actions")
    .dragTo(page.getByTestId("side-pane").locator(".tiptap-editor p").last());
  expect(
    await page.evaluate(
      () =>
        window.readyEditors.main.getJSON().content.filter((node) => node.type === "databaseBlock")
          .length,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(
      () =>
        window.readyEditors.side.getJSON().content.filter((node) => node.type === "databaseBlock")
          .length,
    ),
  ).toBe(1);
  expect(errors).toEqual([]);
});

test("dialog transfers share chronological history and pane padding consumes internal drops", async ({
  page,
}) => {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await page.getByRole("button", { name: "Toggle dialog" }).click();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.readyEditors.dialog?.isInitialized)))
    .toBe(true);
  const main = page.getByTestId("main-pane"),
    dialog = page.getByTestId("dialog-pane");
  await main
    .locator(".tiptap-editor p")
    .first()
    .hover({ position: { x: 5, y: 10 } });
  await main.getByLabel("Open block actions").dragTo(dialog.locator(".tiptap-editor p").last());
  expect(await page.evaluate(() => window.readyEditors.main.state.doc.textContent)).toBe(
    "Main two",
  );
  expect(
    (await page.evaluate(() => window.readyEditors.dialog.state.doc.textContent)).match(
      /Main one/g,
    ),
  ).toHaveLength(1);
  await dialog.locator(".tiptap-editor").click();
  await page.keyboard.press("Meta+z");
  expect(await page.evaluate(() => window.readyEditors.main.state.doc.textContent)).toBe(
    "Main oneMain two",
  );
  await page.getByRole("button", { name: "Toggle dialog" }).click();
  await expect.poll(() => page.evaluate(() => window.readyEditors.dialog)).toBe(undefined);
});

test("shared block controls show hover backgrounds and the insert popover dismisses without moving editor selection", async ({
  page,
}) => {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  const pane = page.getByTestId("main-pane");
  const plus = pane.getByRole("button", { name: "Add block below", exact: true });
  const grip = pane.getByRole("button", { name: "Open block actions", exact: true });
  const popup = page.getByRole("dialog", { name: "Insert block", exact: true });
  const selection = await page.evaluate(() => window.readyEditors.main.state.selection.toJSON());
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      document.documentElement.classList.toggle("dark", theme === "dark");
    }, theme);
    for (const control of [plus, grip]) {
      await pane
        .locator(".tiptap-editor p")
        .first()
        .hover({ position: { x: 25, y: 10 } });
      const idle = await control.evaluate((node) => getComputedStyle(node).backgroundColor);
      await control.hover();
      await expect(control).toHaveAttribute("data-variant", "ghost");
      await expect
        .poll(() => control.evaluate((node) => getComputedStyle(node).backgroundColor))
        .not.toBe(idle);
    }
  }
  await plus.click();
  await expect(popup).toBeVisible();
  expect(await page.evaluate(() => window.readyEditors.main.state.selection.toJSON())).toEqual(
    selection,
  );
  await page.keyboard.press("Escape");
  await expect(popup).not.toBeVisible();
  await plus.click();
  await expect(popup).toBeVisible();
  await page.mouse.click(1390, 850);
  await expect(popup).not.toBeVisible();
  await pane
    .locator(".tiptap-editor p")
    .first()
    .hover({ position: { x: 25, y: 10 } });
  await plus.click();
  await expect(popup).toBeVisible();
  await grip.click();
  await expect(popup).not.toBeVisible();
  await expect(page.getByPlaceholder("Search actions...")).toBeVisible();
});

test("block action menus highlight only their target and clear the highlight on dismissal", async ({
  page,
}) => {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await page.evaluate(() => {
    window.readyEditors.main.commands.setContent(
      "<p>Paragraph</p><ul><li><p>First bullet</p></li><li><p>Second bullet</p></li></ul>" +
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Task</p></li></ul>' +
        "<h2>Heading</h2><p>After</p>",
    );
  });
  const pane = page.getByTestId("main-pane");
  const editor = pane.locator(".tiptap-editor");
  const search = page.getByRole("textbox", { name: "Search block actions", exact: true });
  const originalSelection = await page.evaluate(() =>
    window.readyEditors.main.state.selection.toJSON(),
  );

  for (const selector of [
    ":scope > p:first-child",
    "ul:not([data-type]) > li:nth-child(2)",
    ".node-taskItem",
    ":scope > h2",
  ]) {
    const block = editor.locator(selector).first();
    await block.hover({ position: { x: 25, y: 10 } });
    await pane.getByRole("button", { name: "Open block actions", exact: true }).click();
    await expect(search).toBeVisible();
    await expect(block).toHaveClass(/editor-block-selection/);
    await expect(editor.locator(".editor-block-selection")).toHaveCount(1);
    await expect(page.getByTestId("side-pane").locator(".editor-block-selection")).toHaveCount(0);
    const overlay = await block.evaluate((node) => {
      const style = getComputedStyle(node, "::after");
      return { content: style.content, background: style.backgroundColor };
    });
    expect(overlay.content).toBe('""');
    expect(overlay.background).not.toBe("rgba(0, 0, 0, 0)");
    await search.fill("Heading");
    await expect(block).toHaveClass(/editor-block-selection/);
    expect(await page.evaluate(() => window.readyEditors.main.state.selection.toJSON())).toEqual(
      originalSelection,
    );
    await page.keyboard.press("Escape");
    await expect(search).not.toBeVisible();
    await expect(editor.locator(".editor-block-selection")).toHaveCount(0);
  }

  await editor
    .locator(":scope > p")
    .first()
    .hover({ position: { x: 25, y: 10 } });
  await pane.getByRole("button", { name: "Open block actions", exact: true }).click();
  await expect(editor.locator(".editor-block-selection")).toHaveCount(1);
  await page.mouse.click(1390, 850);
  await expect(search).not.toBeVisible();
  await expect(editor.locator(".editor-block-selection")).toHaveCount(0);

  await editor
    .locator(":scope > p")
    .first()
    .hover({ position: { x: 25, y: 10 } });
  await pane.getByRole("button", { name: "Open block actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(editor.locator(":scope > p").filter({ hasText: "Paragraph" })).toHaveCount(2);
  await expect(editor.locator(".editor-block-selection")).toHaveCount(0);

  await editor.locator(":scope > p").first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+a");
  const selectedCount = await editor.locator(".editor-block-selection").count();
  expect(selectedCount).toBeGreaterThan(1);
  await editor
    .locator(":scope > p")
    .first()
    .hover({ position: { x: 25, y: 10 } });
  await pane.getByRole("button", { name: "Open block actions", exact: true }).click();
  await expect(search).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(search).not.toBeVisible();
  await expect(editor.locator(".editor-block-selection")).toHaveCount(selectedCount);
});

test("insert popovers work in main, side and dialog editors and leave focus on the inserted block", async ({
  page,
}) => {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await page.getByRole("button", { name: "Toggle dialog", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.readyEditors.dialog))).toBe(true);
  for (const name of ["main", "side", "dialog"]) {
    const pane = page.getByTestId(`${name}-pane`);
    const headingCount = await pane.locator(".tiptap-editor h2").count();
    await pane
      .locator(".tiptap-editor p")
      .first()
      .hover({ position: { x: 25, y: 10 } });
    await pane.getByRole("button", { name: "Add block below", exact: true }).click();
    const popup = page.getByRole("dialog", { name: "Insert block", exact: true });
    await expect(popup).toBeVisible();
    await popup.getByRole("option", { name: /^Heading 2/ }).click();
    await expect(popup).not.toBeVisible();
    await expect(pane.locator(".tiptap-editor h2")).toHaveCount(headingCount + 1);
    await expect
      .poll(() => page.evaluate((name) => window.readyEditors[name].isFocused, name))
      .toBe(true);
  }
});

test("block handles keep one document gutter across headings, lists and indented content in every editor", async ({
  page,
}) => {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await page.getByRole("button", { name: "Toggle dialog", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.readyEditors.dialog))).toBe(true);
  const content = [
    "<h2>Heading</h2>",
    "<p>Paragraph</p>",
    "<ul><li><p>Bullet</p><ul><li><p>Nested bullet</p></li></ul></li></ul>",
    "<ol><li><p>Numbered</p></li></ol>",
    '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Task</p></li></ul>',
    "<blockquote><p>Quote</p></blockquote>",
  ].join("");
  for (const name of ["main", "side", "dialog"]) {
    await page.evaluate(
      ({ name, content }) => window.readyEditors[name].commands.setContent(content),
      { name, content },
    );
    const pane = page.getByTestId(`${name}-pane`);
    const editor = pane.locator(".tiptap-editor");
    const plus = pane.getByRole("button", { name: "Add block below", exact: true });
    const grip = pane.getByRole("button", { name: "Open block actions", exact: true });
    let baseline;
    for (const selector of [
      ":scope > h2",
      ":scope > p",
      ":scope > ul:not([data-type]) > li > p",
      "li li > p",
      ":scope > ol li > p",
      '[data-type="taskList"] p',
      "blockquote > p",
    ]) {
      const block = editor.locator(selector).first();
      await block.hover({ position: { x: 25, y: 10 } });
      await expect(grip).toBeVisible();
      await expect
        .poll(async () => {
          const editorRect = await editor.boundingBox();
          const handleRect = await pane.locator(".drag-handle").boundingBox();
          const padding = await editor.evaluate((node) =>
            parseFloat(getComputedStyle(node).paddingLeft),
          );
          return Math.abs(handleRect.x + handleRect.width - editorRect.x - padding);
        })
        .toBeLessThan(2);
      const positions = { plus: (await plus.boundingBox()).x, grip: (await grip.boundingBox()).x };
      baseline ??= positions;
      expect(Math.abs(positions.plus - baseline.plus)).toBeLessThan(2);
      expect(Math.abs(positions.grip - baseline.grip)).toBeLessThan(2);
      await expect
        .poll(async () => {
          const blockRect = await block.boundingBox();
          const handleRect = await pane.locator(".drag-handle").boundingBox();
          const inset = await block.evaluate(
            (node) =>
              parseFloat(getComputedStyle(node).paddingTop) +
              (parseFloat(getComputedStyle(node).lineHeight) - 28) / 2,
          );
          return Math.abs(handleRect.y - blockRect.y - inset);
        })
        .toBeLessThan(2);
    }
  }
});

async function createDatabaseScrollProbe(page) {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await page.evaluate(async () => {
    const { mountScrollTable } =
      await import("/apps/web/test/support/fixtures/database-table-scroll.tsx");
    const host = document.createElement("section");
    host.dataset.testid = "database-scroll-probe";
    Object.assign(host.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      width: "800px",
      height: "420px",
      overflowY: "auto",
      background: "white",
      zIndex: "100",
    });
    const before = document.createElement("div");
    before.style.height = "700px";
    const slot = document.createElement("div");
    const after = document.createElement("div");
    after.style.height = "2000px";
    host.append(before, slot, after);
    document.body.append(host);
    const writes = [];
    const scrollTo = host.scrollTo.bind(host);
    host.scrollTo = (...args) => {
      writes.push(typeof args[0] === "object" ? args[0].top : args[1]);
      scrollTo(...args);
    };
    const editor = window.readyEditors.main;
    const tables = [];
    let table;
    window.databaseScrollProbe = {
      host,
      writes,
      mount: (rows, enabled = true) => {
        const root = document.createElement("div");
        slot.append(root);
        table = mountScrollTable(root, rows, { virtualizationEnabled: enabled });
        tables.push(table);
      },
      unmount: () => {
        for (const mounted of tables.splice(0)) mounted.unmount();
        slot.replaceChildren();
      },
      addTable: (rows) => {
        const root = document.createElement("div");
        slot.append(root);
        tables.push(mountScrollTable(root, rows));
      },
      setRowCount: (rows) => table.setRowCount(rows),
      setEnabled: (enabled) => table.setVirtualizationEnabled(enabled),
      editorIsUnchanged: () => window.readyEditors.main === editor && !editor.isDestroyed,
    };
    host.scrollTop = 600;
  });
}

async function expectDatabaseScrollStable(page, expected) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const result = await page.evaluate(() => ({
    scrollTop: window.databaseScrollProbe.host.scrollTop,
    writes: window.databaseScrollProbe.writes,
    editorIsUnchanged: window.databaseScrollProbe.editorIsUnchanged(),
  }));
  expect(result.scrollTop).toBe(expected);
  expect(result.writes).not.toContain(0);
  expect(result.editorIsUnchanged).toBe(true);
}

test("table mounts preserve page scroll for empty databases, delayed view returns and additional tables", async ({
  page,
}) => {
  await createDatabaseScrollProbe(page);
  for (const rows of [0, 20]) {
    await page.evaluate((rows) => window.databaseScrollProbe.mount(rows), rows);
    await expectDatabaseScrollStable(page, 600);
    await page.evaluate(() => window.databaseScrollProbe.unmount());
    // A view may finish loading after the old two-frame restoration window.
    await expectDatabaseScrollStable(page, 600);
    await expectDatabaseScrollStable(page, 600);
    await page.evaluate((rows) => window.databaseScrollProbe.mount(rows), rows);
    await expectDatabaseScrollStable(page, 600);
    await page.evaluate(() => window.databaseScrollProbe.addTable(20));
    await expectDatabaseScrollStable(page, 600);
    await page.evaluate(() => window.databaseScrollProbe.unmount());
  }
});

test("table virtualization respects live scroll when rows arrive or virtualization resumes", async ({
  page,
}) => {
  await createDatabaseScrollProbe(page);
  await page.evaluate(() => window.databaseScrollProbe.mount(0));
  await expectDatabaseScrollStable(page, 600);
  await page.evaluate(() => {
    window.databaseScrollProbe.host.scrollTop = 800;
    window.databaseScrollProbe.setRowCount(100);
  });
  await expectDatabaseScrollStable(page, 800);
  await page.evaluate(() => window.databaseScrollProbe.setEnabled(false));
  await expectDatabaseScrollStable(page, 800);
  await page.evaluate(() => {
    window.databaseScrollProbe.host.scrollTop = 1000;
    window.databaseScrollProbe.setEnabled(true);
  });
  await expectDatabaseScrollStable(page, 1000);
});
