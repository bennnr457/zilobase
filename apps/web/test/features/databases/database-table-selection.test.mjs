export function register({ assert, loadModule, test }) {
  test("database table selection reports shared and mixed property values", async () => {
    const { getSharedDatabaseSelectionValue } = await loadModule(
      "/src/sections/databases/views/shared/hooks/selection.ts",
    );
    const areEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);

    assert.deepEqual(getSharedDatabaseSelectionValue(["Open", "Open"], areEqual), {
      mixed: false,
      value: "Open",
    });
    assert.deepEqual(getSharedDatabaseSelectionValue(["Open", "Done"], areEqual), {
      mixed: true,
      value: "",
    });
    assert.deepEqual(
      getSharedDatabaseSelectionValue(
        [
          ["A", "B"],
          ["A", "B"],
        ],
        areEqual,
      ),
      { mixed: false, value: ["A", "B"] },
    );
  });
}
