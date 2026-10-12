import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = resolve(root, "src");
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)
        ? [path]
        : [];
  });
}

test("shared client public exports and source graph stay independent of web adapters", () => {
  const config = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
  const files = sourceFiles(sourceRoot);
  const program = ts.createProgram(files, options);
  const checker = program.getTypeChecker();
  const forbiddenModule =
    /^(?:@\/|@tiptap(?:\/|$)|yjs(?:\/|$)|y-protocols(?:\/|$)|dexie(?:\/|$)|dexie-react-hooks(?:\/|$)|electron(?:\/|$)|react-dom(?:\/|$)|@tanstack\/react-router(?:\/|$))|(?:^|\/)apps\/web(?:\/|$)|\.(?:css|scss)$/;
  const browserNames = new Set([
    "window",
    "document",
    "navigator",
    "indexedDB",
    "localStorage",
    "sessionStorage",
    "Window",
    "Document",
    "HTMLElement",
    "Element",
    "DataTransfer",
    "DragEvent",
    "DOMRect",
    "CSSStyleDeclaration",
    "BeforeUnloadEvent",
  ]);
  for (const path of files) {
    const source = program.getSourceFile(path)!;
    const walk = (node: ts.Node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const name = node.moduleSpecifier.text;
        assert.ok(!forbiddenModule.test(name), `${path} imports a web adapter: ${name}`);
        if (name.startsWith(".") || name.startsWith("@zilobase/")) {
          const target = ts.resolveModuleName(name, path, options, ts.sys).resolvedModule;
          assert.ok(target, `Unresolved shared import ${path}: ${name}`);
          assert.ok(
            !target.resolvedFileName.includes("/apps/web/"),
            `${path} reaches web through ${name}`,
          );
        }
      }
      if (ts.isIdentifier(node) && browserNames.has(node.text)) {
        const symbol = checker.getSymbolAtLocation(node);
        // Local record-window variables and types are legitimate domain names.
        const declarations = symbol?.getDeclarations() ?? [];
        assert.ok(
          !declarations.some((declaration) =>
            /\/lib\.dom(?:\.iterable)?\.d\.ts$/.test(declaration.getSourceFile().fileName),
          ),
          `${path} references browser global/type ${node.text}`,
        );
      }
      if (ts.isStringLiteralLike(node))
        assert.ok(!/var\(--/.test(node.text), `${path} resolves CSS colors`);
      ts.forEachChild(node, walk);
    };
    walk(source);
  }
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  for (const [name, entry] of Object.entries(manifest.exports)) {
    const target = resolve(root, (entry as { types: string }).types);
    assert.ok(
      program.getSourceFile(target),
      `Public export ${name} must be covered by the source graph`,
    );
  }
  assert.ok(files.length > 250, "Cover the whole shared client, not only migrated files");
});
