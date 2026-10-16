export function register({ assert, readSource, test }) {
  test("expanded sidebar sections share one compact section shell", async () => {
    const source = await readSource("/src/app/shell/sidebar/components/app-sidebar.tsx");
    assert.equal(source.match(/function SectionShell\(/g)?.length, 1);
    assert.equal(source.match(/<CollapsibleContent className="pb-4 pt-0\.5">/g)?.length, 1);
    assert.equal(source.match(/function SidebarNavRow\(/g)?.length, 1);
  });
}
