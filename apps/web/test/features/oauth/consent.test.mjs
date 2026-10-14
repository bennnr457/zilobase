import { parseHTML } from "linkedom";

export function register({ assert, loadModule, readSource, test }) {
  test("OAuth reads load once, reload explicitly, preserve prior data on errors and reset failed public clients", async () => {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
    Object.assign(globalThis, { window, document });
    let fixture;
    const until = async (condition) => {
      for (let i = 0; i < 50 && !condition(); i++)
        await new Promise((resolve) => setTimeout(resolve, 5));
      assert.ok(condition(), "OAuth reads did not settle");
    };
    try {
      const { mountOAuthReads } = await loadModule(
        "/apps/web/test/support/fixtures/oauth-reads.tsx",
      );
      fixture = mountOAuthReads(document.getElementById("root"));
      await until(
        () =>
          fixture.output.apps.apps.length &&
          !fixture.output.consents.loading &&
          fixture.output.client,
      );
      assert.equal(fixture.requests.length, 3);
      fixture.render("client");
      assert.equal(fixture.requests.length, 3, "rerendering does not refetch");
      fixture.fail();
      await Promise.all([fixture.output.apps.load(), fixture.output.consents.load()]);
      await until(() => fixture.output.apps.error && fixture.output.consents.error);
      assert.equal(fixture.output.apps.apps[0].client_id, "app");
      assert.equal(fixture.output.consents.consents[0].id, "consent");
      assert.equal(fixture.output.consents.loading, false);
      fixture.render("other-client");
      await until(() => fixture.output.client === undefined);
      assert.equal(fixture.requests.length, 6, "failed reads do not retry");
    } finally {
      fixture?.close();
      await new Promise((resolve) => setTimeout(resolve, 10));
      for (const key of Object.getOwnPropertyNames(globalThis))
        if (!saved[key]) delete globalThis[key];
      Object.defineProperties(globalThis, saved);
    }
  });
  test("oauth consent helpers label scopes and preserve signed query", async () => {
    const { labelForScope, parseRequestedScopes } = await loadModule(
      "/packages/features/src/oauth/model.ts",
    );
    const { isOAuthLoginSearch, readOAuthQuery, pickOAuthSearch } = await loadModule(
      "/packages/features/src/oauth/model.ts",
    );

    assert.deepEqual(parseRequestedScopes("openid+clips.write"), ["openid", "clips.write"]);
    assert.equal(labelForScope("clips.write").title, "Save clips");
    assert.equal(isOAuthLoginSearch({ client_id: "zilobase-web-clipper" }), true);
    assert.equal(isOAuthLoginSearch({ error: "invalid" }), false);
    assert.equal(readOAuthQuery("?client_id=abc&scope=openid"), "client_id=abc&scope=openid");
    assert.deepEqual(pickOAuthSearch({ client_id: "abc", returnTo: "/recents" }), {
      client_id: "abc",
    });
  });

  test("oauth consent and callback are public lazy routes", async () => {
    const source = await readSource("/src/app/routing/route-groups/public-routes.tsx");
    assert.match(source, /path: "\/oauth\/consent"/);
    assert.match(source, /path: "\/oauth\/callback"/);
    assert.match(source, /features\/oauth\/screens\/consent/);
    assert.match(source, /features\/oauth\/screens\/callback/);
  });
}
