export function register({ loadModule, readSource, readWorkspace, assert, test }) {
  test("self-host setup keeps its one-time token out of URLs and browser storage", async () => {
    const [page, router] = await Promise.all([
      Promise.all([
        readSource("/src/components/auth/setup.tsx"),
        readSource("/src/components/auth/setup/bootstrap-instance.ts"),
        readWorkspace("packages/features/src/instance/bootstrap.ts"),
      ]).then((parts) => parts.join("\n")),
      readSource("/src/app/routing/router.tsx"),
    ]);

    assert.match(router, /path: "\/setup"/);
    assert.match(page, /"x-zilobase-bootstrap-token"/);
    assert.match(page, /\/api\/instance\/bootstrap/);
    assert.match(page, /authFetch\("\/sign-in\/email"/);
    assert.match(page, /window\.location\.assign\("\/recents"\)/);
    assert.match(page, /setBootstrapCompleted\(true\)/);
    assert.match(page, /Setup completed, but automatic sign-in failed/);
    assert.match(page, /href="\/login">Sign in manually/);
    assert.match(page, /no OTP is\s+sent during setup/);
    assert.doesNotMatch(page, /localStorage|sessionStorage|URLSearchParams/);
  });

  test("bootstrap-required login errors redirect to self-host setup", async () => {
    const [redirects, router, validators] = await Promise.all([
      loadModule("/packages/features/src/auth/model.ts"),
      readSource("/src/app/routing/router.tsx"),
      readSource("/src/app/routing/search-validators.ts"),
    ]);

    assert.equal(redirects.isBootstrapRequiredAuthError("bootstrap_required"), true);
    assert.equal(
      redirects.isBootstrapRequiredAuthError(
        "This_Zilobase_instance_must_be_bootstrapped_before_registration.",
      ),
      true,
    );
    assert.equal(redirects.isBootstrapRequiredAuthError("invalid_invitation"), false);
    assert.match(validators, /search\.error/);
    assert.match(router, /isBootstrapRequiredAuthError\(search\.error\)/);
    assert.match(router, /redirect\(\{ to: "\/setup" \}\)/);
  });
}
