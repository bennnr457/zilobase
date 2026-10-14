import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
function contracts(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? contracts(path)
      : /(?:contracts|contract|entities)\.ts$/.test(entry.name)
        ? [path]
        : [];
  });
}

test("shared wire contracts have no runtime dependency on React or application modules", () => {
  const visited = new Set<string>();
  function inspect(path: string) {
    if (visited.has(path)) return;
    visited.add(path);
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly) continue;
      if (ts.isExportDeclaration(statement) && statement.isTypeOnly) continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      const name = specifier.text;
      assert.ok(
        !/^(react(?:\/|$)|@tanstack\/react-query|@\/|@zilobase\/server)/.test(name),
        `${path} imports ${name}`,
      );
      if (!name.startsWith(".")) continue;
      const base = resolve(dirname(path), name);
      const target = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(existsSync);
      assert.ok(target, `Unresolved contract import ${path}: ${name}`);
      inspect(target);
    }
  }
  for (const path of contracts(resolve(packageRoot, "src"))) inspect(path);
  assert.ok(visited.size > 10, "The test must cover the published contract modules");
});
