import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("./", import.meta.url));
const packageRoot = resolve(root, "..");
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
  exports: Record<string, { default: string }>;
};
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(resolve(dir, entry.name))
      : /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")
        ? [resolve(dir, entry.name)]
        : [],
  );
}
function source(file: string) {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}
function visit(node: ts.Node, inspect: (node: ts.Node) => void) {
  inspect(node);
  ts.forEachChild(node, (child) => visit(child, inspect));
}
function runtimeImport(node: ts.ImportDeclaration | ts.ExportDeclaration) {
  const clause = ts.isImportDeclaration(node) ? node.importClause : node;
  const bindings = ts.isImportDeclaration(node)
    ? node.importClause?.namedBindings
    : node.exportClause;
  return (
    !clause?.isTypeOnly &&
    !(
      bindings &&
      (ts.isNamedImports(bindings) || ts.isNamedExports(bindings)) &&
      bindings.elements.length &&
      !(ts.isImportDeclaration(node) && node.importClause?.name) &&
      bindings.elements.every((item) => item.isTypeOnly)
    )
  );
}
function dependencies(tree: ts.SourceFile) {
  const result: {
    name: string;
    node: ts.ImportDeclaration | ts.ExportDeclaration | ts.CallExpression;
  }[] = [];
  visit(tree, (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      runtimeImport(node)
    ) {
      result.push({ name: (node.moduleSpecifier as ts.StringLiteral).text, node });
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(tree) === "require") &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      result.push({ name: node.arguments[0].text, node });
    }
  });
  return result;
}
function localModule(file: string, name: string) {
  if (!name.startsWith(".")) return;
  const base = resolve(dirname(file), name);
  const target = [base, base + ".ts", base + ".tsx", base + "/index.ts"].find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
  assert.ok(target, `${relative(root, file)}: unresolved ${name}`);
  return target;
}
function moduleGraph(
  entries: readonly string[],
  inspect: (file: string, tree: ts.SourceFile) => void,
) {
  const visited = new Set<string>();
  function walk(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    const tree = source(file);
    inspect(file, tree);
    for (const { name } of dependencies(tree)) {
      const target = localModule(file, name);
      if (target) walk(target);
    }
  }
  for (const entry of entries) walk(entry);
  return visited;
}
function assertClientDependencies(file: string, tree: ts.SourceFile) {
  for (const { name, node } of dependencies(tree)) {
    assert.ok(
      !/^(react(?:\/|$)|react-dom(?:\/|$)|@tanstack\/react-db(?:\/|$)|electron(?:\/|$)|@tiptap\/|yjs(?:\/|$)|@\/|@zilobase\/server)/.test(
        name,
      ),
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
          `${relative(root, file)} imports React hook ${(item.propertyName ?? item.name).text}`,
        );
    }
    const target = localModule(file, name);
    assert.ok(
      !target || !/(?:\/react\.ts|\/shared\/context\.tsx|\/[^/]*-hooks\.ts)$/.test(target),
      `${relative(root, file)} depends on React owner ${target && relative(root, target)}`,
    );
  }
}
function operationEntry(file: string) {
  if (
    /(?:\/operations|[-/]operations?|[-/]operation-context|[-/]operation-mutation)\.ts$/.test(file)
  )
    return true;
  return source(file).statements.some(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
      node.parameters[0]?.type &&
      /ClientOperationContext/.test(node.parameters[0].type.getText()),
  );
}
test("operation dependency graphs contain no React hook, provider or application adapters", () => {
  const entries = files(root).filter(operationEntry);
  assert.ok(entries.length > 20);
  moduleGraph(entries, assertClientDependencies);
});
test("server operation entrypoint has no transitive HTTP adapter dependencies", () => {
  const entry = resolve(packageRoot, "../../apps/server/src/public/operations.ts");
  moduleGraph([entry], (file, tree) => {
    for (const { name } of dependencies(tree)) {
      const target = localModule(file, name);
      assert.ok(
        !/^hono(?:\/|$)/.test(name) && !target?.includes("/apps/server/src/routes/"),
        `${relative(root, file)} depends on HTTP adapter ${name}`,
      );
    }
  });
});

function assertNoRequests(tree: ts.SourceFile, node: ts.Node, label: string) {
  const requests = new Set(["apiFetch", "fetch"]),
    auths = new Set(["auth"]);
  const authReference = (node: ts.Node): boolean =>
    ts.isIdentifier(node)
      ? auths.has(node.text)
      : ts.isPropertyAccessExpression(node) && authReference(node.expression);
  const requestReference = (node: ts.Node): boolean =>
    ts.isIdentifier(node)
      ? requests.has(node.text)
      : ts.isPropertyAccessExpression(node) &&
        (authReference(node.expression) || ["apiFetch", "fetch"].includes(node.name.text));
  let changed = true;
  while (changed) {
    const size = requests.size + auths.size;
    visit(tree, (item) => {
      if (ts.isImportSpecifier(item) && !item.isTypeOnly) {
        const name = (item.propertyName ?? item.name).text;
        if (requests.has(name)) requests.add(item.name.text);
        if (auths.has(name)) auths.add(item.name.text);
      }
      if (ts.isVariableDeclaration(item) && item.initializer) {
        if (ts.isIdentifier(item.name)) {
          if (requestReference(item.initializer)) requests.add(item.name.text);
          if (authReference(item.initializer)) auths.add(item.name.text);
        } else if (ts.isObjectBindingPattern(item.name)) {
          for (const binding of item.name.elements) {
            if (!ts.isIdentifier(binding.name)) continue;
            const name = (binding.propertyName ?? binding.name).getText(tree);
            if (requests.has(name) || authReference(item.initializer))
              requests.add(binding.name.text);
            if (auths.has(name)) auths.add(binding.name.text);
          }
        }
      }
    });
    changed = requests.size + auths.size !== size;
  }
  visit(node, (item) => {
    if (ts.isCallExpression(item))
      assert.ok(
        !requestReference(item.expression),
        `${label} owns backend request ${item.expression.getText(tree)}`,
      );
  });
}
function reactOwner(tree: ts.SourceFile) {
  return tree.statements.some(
    (node) =>
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      runtimeImport(node) &&
      ((node.moduleSpecifier as ts.StringLiteral).text === "react" ||
        ((node.moduleSpecifier as ts.StringLiteral).text === "@tanstack/react-query" &&
          node.importClause?.namedBindings &&
          ts.isNamedImports(node.importClause.namedBindings) &&
          node.importClause.namedBindings.elements.some(
            (item) => !item.isTypeOnly && /^use[A-Z]/.test((item.propertyName ?? item.name).text),
          ))),
  );
}
test("published React entrypoints delegate backend requests to operation and query owners", () => {
  const entries = Object.entries(manifest.exports)
    .filter(([name]) => name.endsWith("/react"))
    .map(([, entry]) => resolve(packageRoot, entry.default));
  assert.ok(entries.length > 0);
  moduleGraph(entries, (file, tree) => {
    if (!reactOwner(tree)) return;
    for (const node of tree.statements) {
      if (ts.isFunctionDeclaration(node)) {
        if (
          relative(root, file) === "meetings/react.ts" &&
          ["useGenerateMeetingSummary", "waitForAiJob"].includes(node.name?.text ?? "")
        )
          continue; // Unsupported legacy endpoints; see server inventory.
        assertNoRequests(tree, node, `${relative(root, file)}:${node.name?.text}`);
      } else if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations)
          if (
            declaration.initializer &&
            (ts.isArrowFunction(declaration.initializer) ||
              ts.isFunctionExpression(declaration.initializer))
          )
            assertNoRequests(
              tree,
              declaration.initializer,
              `${relative(root, file)}:${declaration.name.getText(tree)}`,
            );
      }
    }
  });
});

for (const [name, text] of [
  [
    "destructured transport aliases",
    "function useExample() { const { apiFetch: send } = ports; return send('/x'); }",
  ],
  [
    "transport aliases across declarations",
    "function useExample() { const send = apiFetch; const again = send; return again('/x'); }",
  ],
  [
    "imported transport aliases",
    "import { apiFetch as send } from './transport'; function useExample() { return send('/x'); }",
  ],
  [
    "auth port aliases",
    "function useExample() { const { auth: account } = ports; return account.signOut(); }",
  ],
  [
    "detached auth methods",
    "function useExample() { const { auth: account } = ports; const logout = account.signOut; return logout(); }",
  ],
] as const) {
  test(`hook boundary rejects ${name}`, () => {
    const tree = ts.createSourceFile("fixture.ts", text, ts.ScriptTarget.Latest, true);
    assert.throws(() => assertNoRequests(tree, tree, name), /owns backend request/);
  });
}
test("operation boundary follows dynamic imports and ignores erased type-only exports", () => {
  const tree = ts.createSourceFile(
    "fixture.ts",
    `export { type Context } from 'react'; export type { Props } from 'react'; const load = () => import('react');`,
    ts.ScriptTarget.Latest,
    true,
  );
  assert.equal(dependencies(tree).length, 1);
  assert.throws(() => assertClientDependencies("fixture.ts", tree), /depends on react/);
});
test("hook boundary accepts delegation and query observation", () => {
  const tree = ts.createSourceFile(
    "fixture.ts",
    `function useExample() { const context = useZilobaseFeatures(); return useMutation({ mutationFn: input => executeOperation(context, input) }); }`,
    ts.ScriptTarget.Latest,
    true,
  );
  assertNoRequests(tree, tree, "delegating hook");
});
