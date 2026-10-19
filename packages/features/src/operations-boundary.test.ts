import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const root = fileURLToPath(new URL("./", import.meta.url));
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(resolve(dir, entry.name))
      : /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")
        ? [resolve(dir, entry.name)]
        : [],
  );
}
function runtimeImport(node: ts.ImportDeclaration | ts.ExportDeclaration) {
  if (ts.isImportDeclaration(node)) {
    if (node.importClause?.isTypeOnly) return false;
    const bindings = node.importClause?.namedBindings;
    if (
      bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.length &&
      !node.importClause?.name &&
      bindings.elements.every((item) => item.isTypeOnly)
    )
      return false;
  } else if (node.isTypeOnly) return false;
  return true;
}
test("operation dependency graphs contain no React hook, provider or application adapters", () => {
  const visited = new Set<string>();
  function inspect(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    const tree = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const node of tree.statements) {
      if (
        !(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ||
        !node.moduleSpecifier ||
        !runtimeImport(node)
      )
        continue;
      const name = (node.moduleSpecifier as ts.StringLiteral).text;
      assert.ok(
        !/^(react(?:\/|$)|@\/|@zilobase\/server)/.test(name),
        `${relative(root, file)} depends on ${name}`,
      );
      if (
        ts.isImportDeclaration(node) &&
        name === "@tanstack/react-query" &&
        node.importClause?.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings)
      ) {
        for (const item of node.importClause.namedBindings.elements)
          assert.ok(
            item.isTypeOnly || !/^use[A-Z]/.test((item.propertyName ?? item.name).text),
            `${relative(root, file)} imports a React hook`,
          );
      }
      if (!name.startsWith(".")) continue;
      const base = resolve(dirname(file), name),
        target = [base, base + ".ts", base + ".tsx", base + "/index.ts"].find(
          (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
        );
      assert.ok(target, `${file}: unresolved ${name}`);
      assert.ok(
        !/(?:\/react\.ts|\/shared\/context\.tsx|\/[^/]*-hooks\.ts)$/.test(target),
        `${relative(root, file)} depends on React owner ${relative(root, target)}`,
      );
      inspect(target);
    }
  }
  const entries = files(root).filter((file) =>
    /(?:\/operations|[-/]operations?|[-/]operation-context|[-/]operation-mutation)\.ts$/.test(file),
  );
  assert.ok(entries.length > 20);
  for (const entry of entries) inspect(entry);
});

test("migrated core hooks delegate backend mutations to operation owners", () => {
  const domains = new Set([
    "workspaces",
    "teamspaces",
    "automations",
    "auth",
    "api-keys",
    "user-settings",
    "instance",
    "notifications",
    "oauth",
    "meetings",
  ]);
  for (const file of files(root).filter(
    (file) => file.endsWith("/react.ts") && domains.has(relative(root, file).split("/")[0]!),
  )) {
    const tree = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const statement of tree.statements) {
      if (!ts.isFunctionDeclaration(statement)) continue;
      if (["useGenerateMeetingSummary", "waitForAiJob"].includes(statement.name?.text ?? ""))
        continue; // Explicitly unsupported legacy endpoint; see server inventory.
      const hookName = statement.name?.text;
      function check(node: ts.Node) {
        if (ts.isCallExpression(node))
          assert.ok(
            !/^(?:apiFetch|fetch|auth\.)/.test(node.expression.getText(tree)),
            `${relative(root, file)}:${hookName} owns a backend request`,
          );
        ts.forEachChild(node, check);
      }
      check(statement);
    }
  }
});
