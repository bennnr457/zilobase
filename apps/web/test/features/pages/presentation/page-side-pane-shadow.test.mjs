export function register({ readSource, assert, test }) {
  test("light side panes cast one continuous shadow through the top bar", async () => {
    const source = await readSource("/src/styles/global.css");

    assert.match(
      source,
      /\.light[\s\S]*\[data-page-side-pane-open="true"\][\s\S]*\[data-page-side-pane-panel\][\s\S]*box-shadow: -6px 0 16px -12px/,
    );
    assert.match(source, /var\(--zb-color-effect-shadow-pane\)/);
  });

  test("the docked AI chat sidebar uses the same light elevation", async () => {
    const [styles, rightSidebars] = await Promise.all([
      readSource("/src/styles/global.css"),
      readSource("/src/app/shell/panels/components/tool-panels.tsx"),
    ]);

    assert.match(rightSidebars, /data-ai-chat-sidebar-panel/);
    assert.match(
      styles,
      /\.light \[data-ai-chat-sidebar-panel\]\[aria-hidden="false"\][\s\S]*box-shadow: -6px 0 16px -12px var\(--zb-color-effect-shadow-pane\)/,
    );
  });
}
