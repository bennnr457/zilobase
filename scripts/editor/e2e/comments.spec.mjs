import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/scripts/editor/e2e/page-layout.html?comments=1");
  await expect(page.locator(".editor-comment-anchor")).toBeVisible();
});

test("floating comments reserve space, navigate anchors, reply, resolve and undo", async ({
  page,
}) => {
  const content = page.locator(".editor-comments-document");
  const before = await content.boundingBox();
  await page.getByRole("button", { name: "Open comments", exact: true }).click();
  const card = page.getByRole("region", { name: "Comments", exact: true });
  await expect(card).toBeVisible();
  await expect
    .poll(async () => (await content.boundingBox()).width)
    .toBeLessThan(before.width - 300);
  const mainBox = await content.boundingBox();
  const cardBox = await card.boundingBox();
  expect(cardBox.x).toBeGreaterThan(mainBox.x + mainBox.width);
  const toc = page.getByRole("button", { name: "Table of contents", exact: true });
  const tocBox = await toc.boundingBox();
  expect(cardBox.x + cardBox.width).toBeLessThan(tocBox.x - 16);
  await toc.hover();
  await expect(page.getByRole("navigation", { name: "Page headings" })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page.getByRole("navigation", { name: "Page headings" })).not.toBeVisible();
  await expect(card.getByRole("tab")).toHaveCount(0);
  await expect(card.getByText("1 reply", { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("floating-comments.png") });

  await card.getByRole("button", { name: /Maya Chen.*Shared drafts/ }).click();
  const reply = card.getByPlaceholder("Reply...");
  await reply.fill("The updated wording looks good.");
  await expect(reply).toBeFocused();
  await reply.press("Enter");
  await expect(card.getByText("The updated wording looks good.", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Resolve comment from Maya Chen", exact: true }).click();
  await expect(card.getByText("No open comments.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(card.getByText("The updated wording looks good.", { exact: true })).toBeVisible();

  await card.getByRole("button", { name: "Close comments", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect.poll(async () => (await content.boundingBox()).width).toBe(before.width);
  await page.locator(".editor-comment-anchor").click();
  await expect(card).toBeVisible();
  await expect(card.getByPlaceholder("Reply...")).toBeVisible();
});

test("selection comments keep their anchor while the document changes", async ({ page }) => {
  await page.evaluate(() => {
    const editor = window.commentEditors.get("main");
    editor.chain().focus().setTextSelection({ from: 22, to: 35 }).run();
  });
  await page.getByRole("button", { name: "Comment on selection", exact: true }).click();
  const input = page.getByPlaceholder("Add a comment…", { exact: true });
  await input.fill("Clarify this selection.");
  await page.evaluate(() => {
    const editor = window.commentEditors.get("main");
    editor.view.dispatch(editor.state.tr.insertText("New: ", 1));
  });
  await input.press("Enter");
  await expect(page.getByRole("region", { name: "Comments", exact: true })).toBeVisible();
  const thread = await page.evaluate(() =>
    window.commentControllers
      .get("main")
      .getSnapshot()
      .threads.find((t) => t.kind === "inline"),
  );
  expect(thread.quote).toBe("agents write ".trim());
  expect(thread.anchorAttached).toBe(true);
  await expect(page.locator(`[data-comment-id="${thread.id}"]`)).toHaveText(" agents write");
});

test("narrow pages keep comments in the same content flow", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  const content = page.locator(".editor-comments-document");
  const before = await content.boundingBox();
  const viewport = page.locator("[data-page-scroll-viewport]");
  const viewportBefore = await viewport.boundingBox();
  await page.getByRole("button", { name: "Open comments", exact: true }).click();
  const card = page.getByRole("region", { name: "Comments", exact: true });
  await expect(card).toBeVisible();
  const after = await content.boundingBox();
  const cardBox = await card.boundingBox();
  expect(after.width).toBe(before.width);
  expect(after.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height);
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(600);
  expect(await viewport.boundingBox()).toEqual(viewportBefore);
  await card.getByRole("button", { name: "Close comments", exact: true }).click();
  await expect.poll(async () => (await content.boundingBox()).y).toBe(before.y);
});

test("only the cover stays full width while metadata and document make room for comments", async ({
  page,
}) => {
  await page.goto("/scripts/editor/e2e/page-layout.html?comments=1&cover=1");
  const cover = page.getByRole("img", { name: "Cover", exact: true });
  const metadata = page.locator("[data-page-metadata-content]");
  const viewport = page.locator("[data-page-scroll-viewport]");
  const editor = page.locator(".editor-comments-document");
  await expect(cover).toBeVisible();
  await expect(page.getByRole("button", { name: "Open comments", exact: true })).toBeVisible();
  const coverBefore = await cover.boundingBox();
  const metadataBefore = await metadata.boundingBox();
  const viewportBefore = await viewport.boundingBox();
  const editorBefore = await editor.boundingBox();
  await page.getByRole("button", { name: "Open comments", exact: true }).click();
  const card = page.getByRole("region", { name: "Comments", exact: true });
  await expect(card).toBeVisible();
  await expect
    .poll(async () => (await editor.boundingBox()).width)
    .toBeLessThan(editorBefore.width - 300);
  expect(await cover.boundingBox()).toEqual(coverBefore);
  const metadataAfter = await metadata.boundingBox();
  expect(metadataAfter.width).toBeLessThan(metadataBefore.width - 300);
  expect(metadataAfter.width).toBe((await editor.boundingBox()).width);
  expect(metadataAfter.x).toBe((await editor.boundingBox()).x);
  expect(await viewport.boundingBox()).toEqual(viewportBefore);
  const cardBox = await card.boundingBox();
  expect(cardBox.y).toBeGreaterThanOrEqual(coverBefore.y + coverBefore.height);
  expect(cardBox.y).toBeLessThan(metadataAfter.y + metadataAfter.height);
  expect(
    await card.evaluate((el) =>
      Boolean(el.closest("[data-editor-surface]") && el.closest("[data-page-scroll-viewport]")),
    ),
  ).toBe(true);
  await page.screenshot({ path: test.info().outputPath("comments-below-cover.png") });
  await viewport.evaluate((el) => {
    el.scrollTop = 120;
  });
  await expect.poll(async () => (await card.boundingBox()).y).toBeLessThan(cardBox.y - 100);
});

test("opening comments uses the same content width in narrow and full-width modes", async ({
  page,
}) => {
  const geometry = async (narrow) => {
    await page.goto(
      `/scripts/editor/e2e/page-layout.html?comments=1&cover=1${narrow ? "&narrow=1" : ""}`,
    );
    await page.getByRole("button", { name: "Open comments", exact: true }).click();
    const body = page.locator("[data-editor-page-content]");
    await expect(page.locator(".floating-comments")).toBeVisible();
    await page
      .locator(".editor-comments-body")
      .evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
    expect((await body.boundingBox()).width).toBeGreaterThan(950);
    return {
      body: await body.boundingBox(),
      metadata: await page.locator("[data-page-metadata-content]").boundingBox(),
      cover: await page.getByRole("img", { name: "Cover", exact: true }).boundingBox(),
    };
  };
  const narrow = await geometry(true);
  const full = await geometry(false);
  expect(narrow).toEqual(full);
});

test("comment requests stay in their page pane and do not remount the editor", async ({ page }) => {
  await page.getByRole("button", { name: "Direct pane", exact: true }).click();
  const pane = page.locator('[data-page-layout="pane"]');
  await expect(pane.locator(".editor-comment-anchor")).toBeVisible();
  await page.evaluate(() => {
    window.savedCommentEditor = window.commentEditors.get("child");
  });
  await pane.getByRole("button", { name: "Show comments", exact: true }).click();
  await expect(pane.getByRole("region", { name: "Comments", exact: true })).toBeVisible();
  await expect(page.locator('[data-page-layout="main"] .floating-comments')).toHaveCount(0);
  await pane.getByRole("button", { name: "Close comments", exact: true }).last().click();
  expect(
    await page.evaluate(() => window.savedCommentEditor === window.commentEditors.get("child")),
  ).toBe(true);
});
