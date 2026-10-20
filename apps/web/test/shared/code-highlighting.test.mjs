export function register({ assert, loadModule, test }) {
  test("shared formula highlighting retains exact source through async and cached reads", async () => {
    const { highlightCode, createRawTokens } = await loadModule("/src/lib/code-highlighting.ts");
    const prefix = "/*" + "a".repeat(110);
    const suffix = "b".repeat(110) + "*/";
    const first = `${prefix} first ${suffix}`;
    const second = `${prefix} other ${suffix}`;
    const source = (result) =>
      result.tokens.map((line) => line.map((token) => token.content).join("")).join("\n");
    const highlight = (code) =>
      new Promise((resolve) => {
        const cached = highlightCode(code, "js", resolve);
        if (cached) resolve(cached);
      });
    assert.equal(source(createRawTokens("one\n\nthree")), "one\n\nthree");
    assert.equal(source(await highlight(first)), first);
    assert.equal(source(await highlight(second)), second);
    assert.equal(source(highlightCode(first, "js")), first);
  });
}
