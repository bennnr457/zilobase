export function register({ assert, readSource, test }) {
  test("top-level routes load feature pages on demand", async () => {
    const source = await readSource("/src/app/routing/router.tsx");

    assert.match(source, /lazyRouteComponent/);
    assert.match(source, /\(\) => import\("@\/components\//);
    assert.doesNotMatch(source, /import [^\n]+ from "@\/components\/[^\n]+\/pages\//);
  });

  test("the application shell and expensive optional surfaces are lazy", async () => {
    const [routeShell, appLayout, tasks] = await Promise.all([
      readSource("/src/app/routing/route-shell.tsx"),
      readSource("/src/app/shell/app-shell.tsx"),
      readSource("/src/components/tasks/tasks.tsx"),
    ]);

    assert.match(routeShell, /const AppShell = lazy/);
    assert.match(routeShell, /fallback=\{<PendingPage \/>\}/);
    assert.match(appLayout, /const ChatSidebarPanel = lazy/);
    assert.match(appLayout, /chatSidebarOpen \? \(/);
    assert.match(tasks, /const DatabaseListView = lazy/);
    assert.match(tasks, /const DatabaseSetupCard = lazy/);
    assert.match(tasks, /const DatabaseViewToolbar = lazy/);
  });
}
