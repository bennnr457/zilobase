import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api.zilobase.test/**", (route) => route.fulfill({ json: {} }));
  await page.goto("/scripts/editor/e2e/index.html");
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
});

async function paste(page, text, data = {}, options = {}) {
  return page.evaluate(
    ({ text, data, options }) => {
      const editor = window.readyEditors.main;
      editor.commands.setContent(options.content ?? "<p></p>");
      editor.commands.setTextSelection(options.position ?? 1);
      editor.view.focus();
      const clipboard = new DataTransfer();
      clipboard.setData("text/plain", text);
      for (const [type, value] of Object.entries(data)) clipboard.setData(type, value);
      if (options.plain)
        editor.view.dom.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "v",
            metaKey: true,
            ctrlKey: true,
            shiftKey: true,
            bubbles: true,
          }),
        );
      editor.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }),
      );
      return editor.getJSON();
    },
    { text, data, options },
  );
}

test("Turn into preserves the paragraph text and makes one undoable code block", async ({
  page,
}) => {
  await page.evaluate(() =>
    window.readyEditors.main.commands.setContent(
      "<p>Hello <strong>bold</strong> world</p><p>Untouched</p>",
    ),
  );
  const pane = page.getByTestId("main-pane");
  await pane
    .locator(".tiptap-editor > p")
    .first()
    .hover({ position: { x: 25, y: 10 } });
  await pane.getByRole("button", { name: "Open block actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Turn into", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Code Block", exact: true }).click();
  await expect(pane.locator(".code-block-shiki code")).toHaveText("Hello bold world");
  expect(
    await page.evaluate(() => {
      const editor = window.readyEditors.main;
      editor.commands.undo();
      return editor.getHTML();
    }),
  ).toContain("<strong>bold</strong>");
  await expect(pane.locator(".tiptap-editor")).toContainText("Untouched");
});

test("conversion handles selected paragraphs, partial lists, hard breaks and refuses custom atoms", async ({
  page,
}) => {
  const results = await page.evaluate(async () => {
    const { convertBlocks, canConvertBlocks } =
      await import("/apps/web/src/sections/pages/editor/commands/lib/block-insert.ts");
    const editor = window.readyEditors.main;
    const run = (html, id, select) => {
      editor.commands.setContent(html);
      const targets = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "paragraph") targets.push({ node, pos });
      });
      const target = targets[select ? 1 : 0];
      if (select)
        editor.commands.setTextSelection({
          from: targets[0].pos + 1,
          to: targets[1].pos + targets[1].node.nodeSize - 1,
        });
      const before = editor.getJSON();
      const can = canConvertBlocks(editor, target, id);
      const unchanged = JSON.stringify(before) === JSON.stringify(editor.getJSON());
      const applied = convertBlocks(editor, target, id);
      editor.state.doc.check();
      return {
        can,
        unchanged,
        applied,
        html: editor.getHTML(),
        text: editor.state.doc.textContent,
      };
    };
    const multi = run("<p>One<br>line</p><p>Two</p><p>Keep</p>", "codeBlock", true);
    const list = run(
      "<ul><li><p>First</p></li><li><p>Second</p></li><li><p>Third</p></li></ul>",
      "heading2",
      false,
    );
    editor.commands.setContent({
      type: "doc",
      content: [
        { type: "imageBlock", attrs: { src: "https://example.com/image.png" } },
        { type: "paragraph", content: [{ type: "text", text: "Keep" }] },
      ],
    });
    const before = editor.getJSON();
    const rejected = convertBlocks(
      editor,
      { node: editor.state.doc.firstChild, pos: 0 },
      "codeBlock",
    );
    return {
      multi,
      list,
      rejected,
      protectedUnchanged: JSON.stringify(before) === JSON.stringify(editor.getJSON()),
    };
  });
  expect(results.multi).toMatchObject({ can: true, unchanged: true, applied: true });
  expect(results.multi.html).toContain("One\nline\nTwo");
  expect(results.multi.text).toContain("Keep");
  expect(results.list.applied).toBe(true);
  expect(results.list.html).toMatch(/<h2[^>]*>First<\/h2>/);
  expect(results.list.text).toBe("FirstSecondThird");
  expect(results.rejected).toBe(false);
  expect(results.protectedUnchanged).toBe(true);
});

for (const mode of ["plain", "vscode", "mime"]) {
  test(`Markdown paste renders structure from ${mode}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const markdown = "# Heading\n\n- First\n- Second\n\n```js\nconst answer = 42\n```";
    const data =
      mode === "vscode"
        ? {
            "vscode-editor-data": JSON.stringify({ mode: "markdown" }),
            "text/html": "<pre>source formatting</pre>",
          }
        : mode === "mime"
          ? { "text/markdown": markdown }
          : {};
    const doc = await paste(page, markdown, data);
    expect(doc.content.map((node) => node.type)).toEqual(
      expect.arrayContaining(["heading", "bulletList", "codeBlock"]),
    );
    expect(doc.content.find((node) => node.type === "codeBlock").content[0].text).toBe(
      "const answer = 42",
    );
    expect(errors).toEqual([]);
  });
}

test("Markdown image, task and table use the custom schema", async ({ page }) => {
  const doc = await paste(
    page,
    '![Diagram](https://example.com/diagram.png "Title")\n\n- [x] Done\n\n| Name | Value |\n| --- | --- |\n| One | Two |',
  );
  expect(doc.content.map((node) => node.type)).toEqual(
    expect.arrayContaining(["imageBlock", "taskList", "table"]),
  );
  expect(doc.content.find((node) => node.type === "imageBlock").attrs).toMatchObject({
    src: "https://example.com/diagram.png",
    alt: "Diagram",
    title: "Title",
  });
});

test("code context and plain-text paste stay literal; real VS Code source stays code", async ({
  page,
}) => {
  const code = {
    type: "doc",
    content: [{ type: "codeBlock", content: [{ type: "text", text: "prefix " }] }],
  };
  const literal = await paste(
    page,
    "# literal\n**text**",
    { "vscode-editor-data": JSON.stringify({ mode: "markdown" }) },
    { content: code, position: 8 },
  );
  expect(literal.content[0].content[0].text).toBe("prefix # literal\n**text**");
  const plain = await paste(
    page,
    "# literal",
    { "vscode-editor-data": JSON.stringify({ mode: "markdown" }) },
    { plain: true },
  );
  expect(plain.content[0].type).toBe("paragraph");
  expect(plain.content[0].content[0].text).toBe("# literal");
  const source = await paste(page, "const x = 1;", {
    "vscode-editor-data": JSON.stringify({ mode: "javascript" }),
  });
  expect(source.content[0]).toMatchObject({ type: "codeBlock", attrs: { language: "javascript" } });
});

test("malformed metadata and emoji HTML cannot break paste; single-row data tables stay tables", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const text = await paste(page, "ordinary text", { "vscode-editor-data": "not JSON" });
  expect(text.content[0].content[0].text).toBe("ordinary text");
  const html =
    '<span data-type="emoji">😀</span><table><tbody><tr><td>Left</td><td>Right</td></tr></tbody></table>';
  const table = await paste(page, "Left Right", { "text/html": html });
  expect(table.content.some((node) => node.type === "table")).toBe(true);
  expect(table.content.some((node) => node.type === "columnBlock")).toBe(false);
  expect(errors).toEqual([]);
});

test("Select All can delete ordinary blocks but protects resource blocks", async ({ page }) => {
  const editor = page.getByTestId("main-pane").locator(".tiptap-editor");
  await page.evaluate(() => window.readyEditors.main.commands.setContent("<p>One</p><p>Two</p>"));
  await editor.locator("p").first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await expect(editor).toHaveText("");
  await page.evaluate(() =>
    window.readyEditors.main.commands.setContent({
      type: "doc",
      content: [
        { type: "meetingBlock", attrs: { meetingId: null } },
        { type: "paragraph", content: [{ type: "text", text: "Keep" }] },
      ],
    }),
  );
  await editor.locator("p").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  expect(await page.evaluate(() => window.readyEditors.main.getJSON().content[0].type)).toBe(
    "meetingBlock",
  );
});

test("read-only code controls reject mutation while copy stays available", async ({ page }) => {
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.commands.setContent({
      type: "doc",
      content: [{ type: "codeBlock", content: [{ type: "text", text: "Keep" }] }],
    });
    editor.setEditable(false);
    editor.view.dispatch(editor.state.tr.setMeta("editorCapabilities", true));
  });
  const pane = page.getByTestId("main-pane");
  await expect(pane.getByRole("combobox", { name: "Code block language" })).toBeDisabled();
  await expect(pane.getByRole("button", { name: "Copy code" })).toBeEnabled();
});

async function setCodeBlock(page, text, language) {
  await page.evaluate(
    ({ text, language }) => {
      window.readyEditors.main
        .chain()
        .setContent({
          type: "doc",
          content: [{ type: "codeBlock", attrs: { language }, content: [{ type: "text", text }] }],
        })
        .setMeta("addToHistory", false)
        .run();
    },
    { text, language },
  );
}

test("ReUI code chrome keeps one editable surface, highlighting, language changes and undo", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await setCodeBlock(page, "const answer = 42;\nconsole.log(answer);", "js");
  const block = page.getByTestId("main-pane").locator(".code-block-shiki");
  await expect(block.locator('[data-slot="code-block"]')).toHaveCount(1);
  await expect(block.locator('[data-slot="code-block-header"]')).toHaveCount(1);
  await expect(block.locator("pre")).toHaveCount(1);
  await expect(block.locator("code")).toHaveCount(1);
  await expect.poll(() => block.locator("code span[style]").count()).toBeGreaterThan(0);
  const source = await block.locator("code").textContent();
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.commands.setTextSelection(editor.state.doc.firstChild.nodeSize - 1);
    editor.view.focus();
  });
  await page.keyboard.type(" // edited");
  await expect(block.locator("code")).toHaveText(source + " // edited");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(block.locator("code")).toHaveText(source);
  await block.getByRole("combobox", { name: "Code block language" }).click();
  await page.getByRole("menuitem", { name: "Python", exact: true }).click();
  await expect(block.getByRole("combobox", { name: "Code block language" })).toContainText(
    "Python",
  );
  expect(
    await page.evaluate(() => window.readyEditors.main.getJSON().content[0].attrs.language),
  ).toBe("py");
  const html = await page.evaluate(() => window.readyEditors.main.getHTML());
  expect(html).toContain('class="language-py"');
  expect(html).not.toContain("code-block-header");
  expect(html).not.toContain("Wrap");
  expect(errors).toEqual([]);
});

test("ReUI copy preserves literal source, reports clipboard errors and keeps long lines scrollable", async ({
  page,
}) => {
  const source =
    'const message = "' +
    "a long value ".repeat(35) +
    '"; // [!code highlight]\n\n// trailing newline\n';
  await page.evaluate((source) => {
    window.codeCopied = [];
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async (text) => {
        window.codeCopied.push(text);
      },
    });
    window.readyEditors.main.commands.setContent({
      type: "doc",
      content: [
        { type: "codeBlock", attrs: { language: "js" }, content: [{ type: "text", text: source }] },
      ],
    });
  }, source);
  const block = page.getByTestId("main-pane").locator(".code-block-shiki");
  const before = await page.evaluate(() => window.readyEditors.main.getJSON());
  await block.getByRole("button", { name: "Copy code", exact: true }).click();
  await expect(block.getByRole("button", { name: "Copied code", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.codeCopied)).toEqual([source]);
  await expect(block.locator("code")).toHaveCSS("white-space", "pre");
  await expect(block.getByRole("button", { name: "Wrap code", exact: true })).toHaveCount(0);
  expect(await block.locator("pre").evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(
    true,
  );
  expect(await page.evaluate(() => window.readyEditors.main.getJSON())).toEqual(before);
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async () => {
        throw new Error("Clipboard denied");
      },
    }),
  );
  await block.locator('[data-slot="code-block-copy"]').click();
  await expect(page.getByText("Could not copy code.", { exact: true })).toBeVisible();
});

test("ReUI code blocks keep transparent outer corners in both themes and remain editable", async ({
  page,
}) => {
  await setCodeBlock(page, "const value: number = 1;", "ts");
  const block = page.getByTestId("main-pane").locator(".code-block-shiki");
  await expect.poll(() => block.locator("code span[style]").count()).toBeGreaterThan(0);
  const light = await block
    .locator('[data-slot="code-block"]')
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  const dark = await block
    .locator('[data-slot="code-block"]')
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(dark).not.toBe(light);
  await expect(block.getByRole("combobox", { name: "Code block language" })).toBeEnabled();
  await expect(block.getByRole("button", { name: "Wrap code" })).toHaveCount(0);
  const assertTransparentTokens = async () => {
    expect(
      await block
        .locator("code span")
        .evaluateAll((tokens) =>
          tokens.every((token) => getComputedStyle(token).backgroundColor === "rgba(0, 0, 0, 0)"),
        ),
    ).toBe(true);
  };
  await assertTransparentTokens();
  const outer = page.getByTestId("main-pane").locator(".node-codeBlock");
  await expect(outer).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(block).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await expect(outer).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await assertTransparentTokens();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.commands.setTextSelection(editor.state.doc.firstChild.nodeSize - 1);
    editor.view.focus();
  });
  await page.keyboard.press("Enter");
  await page.keyboard.type("// more code");
  await expect(block.locator("code")).toHaveText("const value: number = 1;\n// more code");
  await page
    .getByTestId("main-pane")
    .locator(".node-codeBlock")
    .screenshot({ path: test.info().outputPath("reui-code-block.png") });
  await page.keyboard.press("ControlOrMeta+z");
  expect(await page.evaluate(() => window.readyEditors.main.getJSON().content[0].type)).toBe(
    "codeBlock",
  );
});

test("selected ordinary blocks accept replacement typing and Markdown paste", async ({ page }) => {
  const editor = page.getByTestId("main-pane").locator(".tiptap-editor");
  await page.evaluate(() => window.readyEditors.main.commands.setContent("<p>One</p><p>Two</p>"));
  await editor.locator("p").first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Replacement");
  await expect(editor).toHaveText("Replacement");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+a");
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData("text/plain", "# Replaced");
    window.readyEditors.main.view.dom.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect(editor.locator("h1")).toHaveText("Replaced");
});

test("async bookmark choices follow preceding edits and ignore a replaced source", async ({
  page,
}) => {
  let finish;
  await page.route("**/metadata/bookmark?**", async (route) => {
    await new Promise((resolve) => {
      finish = resolve;
    });
    await route.fulfill({
      json: { title: "Metadata title", description: null, favicon: null, image: null },
    });
  });
  for (const replaced of [false, true]) {
    await paste(page, "https://example.com/article");
    await page.getByRole("menuitem", { name: "Bookmark", exact: true }).click();
    await expect.poll(() => Boolean(finish)).toBe(true);
    await page.evaluate((replaced) => {
      const editor = window.readyEditors.main;
      if (replaced) editor.commands.setContent("<p>New document content</p>");
      else
        editor.commands.insertContentAt(0, {
          type: "paragraph",
          content: [{ type: "text", text: "Earlier edit" }],
        });
    }, replaced);
    finish();
    finish = undefined;
    await expect(page.getByRole("menuitem", { name: "Bookmark", exact: true })).toHaveCount(0);
    const editor = page.getByTestId("main-pane").locator(".tiptap-editor");
    if (replaced) await expect(editor).toHaveText("New document content");
    else {
      await expect(editor).toContainText("Earlier edit");
      await expect(editor.locator(".bookmark-block")).toContainText("Metadata title");
    }
  }
});

test("internal HTML copy preserves custom block identities and columns wrap content without adding a column", async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const editor = window.readyEditors.main;
    const original = {
      type: "doc",
      content: [
        {
          type: "embedBlock",
          attrs: { src: "https://www.youtube.com/embed/test", provider: "youtube" },
        },
        { type: "fileBlock", attrs: { href: "https://example.com/file.pdf", title: "Document" } },
        { type: "imageBlock", attrs: { src: "https://example.com/image.png", alt: "Picture" } },
      ],
    };
    editor.commands.setContent(original);
    const { dom, text } = editor.view.serializeForClipboard(
      editor.state.doc.slice(0, editor.state.doc.content.size),
    );
    const expected = editor.getJSON();
    editor.commands.setContent("<p></p>");
    editor.commands.setTextSelection(1);
    const data = new DataTransfer();
    data.setData("text/html", dom.innerHTML);
    data.setData("text/plain", text);
    editor.view.dom.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
    const copied = editor.getJSON();
    editor.commands.setContent("<p>Keep content</p>");
    const dryRun = editor.can().setColumns(2, true);
    const unchanged = editor.state.doc.textContent === "Keep content";
    editor.commands.setColumns(2, true);
    return {
      expected,
      copied,
      dryRun,
      unchanged,
      columns: editor.state.doc.firstChild.childCount,
      text: editor.state.doc.textContent,
    };
  });
  expect(result.copied).toEqual(result.expected);
  expect(result).toMatchObject({ dryRun: true, unchanged: true, columns: 2, text: "Keep content" });
});

test("switching local document IDs replaces the editor without retaining the prior draft", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.originalEditorForSwitchTest = window.readyEditors.main;
  });
  await page.getByRole("button", { name: "Replace local document", exact: true }).click();
  await expect(page.getByTestId("main-pane").locator(".tiptap-editor")).toHaveText(
    "Local replacement 1",
  );
  expect(
    await page.evaluate(
      () =>
        window.readyEditors.main !== window.originalEditorForSwitchTest &&
        window.originalEditorForSwitchTest.isDestroyed,
    ),
  ).toBe(true);
});

test("IME input and forward deletion cannot replace protected resources", async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.commands.setContent({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        { type: "meetingBlock", attrs: { meetingId: null } },
        { type: "paragraph", content: [{ type: "text", text: "After" }] },
      ],
    });
    const pos = editor.state.doc.firstChild.nodeSize;
    editor.commands.setNodeSelection(pos);
    const before = JSON.stringify(editor.getJSON());
    const input = new InputEvent("beforeinput", {
      inputType: "insertCompositionText",
      data: "new",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    editor.view.dom.dispatchEvent(input);
    const protectedIME = input.defaultPrevented;
    editor.commands.setTextSelection(pos - 1);
    const forward = new KeyboardEvent("keydown", {
      key: "Delete",
      bubbles: true,
      cancelable: true,
    });
    editor.view.dom.dispatchEvent(forward);
    return {
      protectedIME,
      protectedForward: forward.defaultPrevented,
      unchanged: before === JSON.stringify(editor.getJSON()),
    };
  });
  expect(result).toEqual({ protectedIME: true, protectedForward: true, unchanged: true });
});

test("multi-block conversion inside a column keeps its container and unselected siblings", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { convertBlocks } =
      await import("/apps/web/src/sections/pages/editor/commands/lib/block-insert.ts");
    const editor = window.readyEditors.main;
    const paragraph = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "columnBlock",
          content: [
            { type: "column", content: [paragraph("One"), paragraph("Two"), paragraph("Keep")] },
            { type: "column", content: [paragraph("Other column")] },
          ],
        },
      ],
    });
    const targets = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph") targets.push({ node, pos });
    });
    editor.commands.setTextSelection({
      from: targets[0].pos + 1,
      to: targets[1].pos + targets[1].node.nodeSize - 1,
    });
    const applied = convertBlocks(editor, targets[1], "codeBlock");
    editor.state.doc.check();
    return { applied, doc: editor.getJSON() };
  });
  expect(result.applied).toBe(true);
  const columns = result.doc.content[0].content;
  expect(columns[0].content[0]).toMatchObject({
    type: "codeBlock",
    content: [{ type: "text", text: "One\nTwo" }],
  });
  expect(columns[0].content[1].content[0].text).toBe("Keep");
  expect(columns[1].content[0].content[0].text).toBe("Other column");
});
