export function register({ readSource, assert, test }) {
  test("form surfaces use the control background role", async () => {
    const inputSource = await readSource("/src/components/ui/input.tsx");
    const textareaSource = await readSource("/src/components/ui/textarea.tsx");
    const promptInputSource = await readSource("/src/components/ai/composer/prompt-input.tsx");
    const selectSource = await readSource("/src/components/ui/select.tsx");

    assert.match(
      inputSource,
      /buttonControlHeightClassName,[\s\S]*?border-control-border bg-control-background/,
    );
    assert.match(textareaSource, /border-control-border bg-control-background/);
    assert.match(promptInputSource, /overflow-hidden bg-control-background/);
    assert.match(selectSource, /border-control-border bg-control-background/);
    assert.doesNotMatch(`${inputSource}${textareaSource}${selectSource}`, /dark:bg-/);
  });
}
