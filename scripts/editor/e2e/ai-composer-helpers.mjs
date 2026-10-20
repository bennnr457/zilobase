export const draft = (page) => page.locator('textarea[name="message"]');

// A fresh draft can contain persistent inline context. Type around those pills
// rather than selecting/deleting the entire rich document with fill().
export async function writePrompt(page, text) {
  const input = page.getByRole("textbox", { name: "Ask AI message" });
  if (
    (await input.locator("[data-ai-inline-mention]").count()) &&
    !(await draft(page).inputValue())
  ) {
    await input.click();
    await input.press("End");
    const lines = text.split("\n");
    for (let index = 0; index < lines.length; index++) {
      if (index) await input.press("Shift+Enter");
      if (lines[index]) await input.pressSequentially(lines[index]);
    }
  } else await input.fill(text);
}
