export function register({ assert, loadModule, test }) {
  test("Ask AI, notion import, and the web clipper stay disabled unless config enables them", async () => {
    const { isFeatureEnabled } = await loadModule("/src/app/config/feature-flags.ts");

    assert.equal(isFeatureEnabled("askAi"), false);
    assert.equal(isFeatureEnabled("notionImport"), false);
    assert.equal(isFeatureEnabled("webClipper"), false);
  });

  test("readBooleanFeatureFlag accepts common boolean config values", async () => {
    const { readBooleanFeatureFlag } = await loadModule("/src/app/config/feature-flags.ts");

    assert.equal(readBooleanFeatureFlag("true"), true);
    assert.equal(readBooleanFeatureFlag("1"), true);
    assert.equal(readBooleanFeatureFlag("yes"), true);
    assert.equal(readBooleanFeatureFlag("on"), true);
    assert.equal(readBooleanFeatureFlag("false", true), false);
    assert.equal(readBooleanFeatureFlag("0", true), false);
    assert.equal(readBooleanFeatureFlag("no", true), false);
    assert.equal(readBooleanFeatureFlag("off", true), false);
    assert.equal(readBooleanFeatureFlag(undefined, true), true);
    assert.equal(readBooleanFeatureFlag("unexpected", false), false);
  });
}
