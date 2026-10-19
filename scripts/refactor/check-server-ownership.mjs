import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

function sourceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.tsx?$/.test(entry.name) && !/\.(?:test|d)\.tsx?$/.test(entry.name)
        ? [path]
        : [];
  });
}

function imports(source) {
  const result = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const clause = ts.isImportDeclaration(node) ? node.importClause : node;
      const bindings = ts.isImportDeclaration(node) ? clause?.namedBindings : node.exportClause;
      const typeOnly =
        Boolean(clause?.isTypeOnly) ||
        Boolean(
          bindings?.elements?.length &&
          !clause?.name &&
          bindings.elements.every((item) => item.isTypeOnly),
        );
      result.push({ specifier: node.moduleSpecifier.text, typeOnly });
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(source) === "require") &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      result.push({ specifier: node.arguments[0].text, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}

function localModule(file, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(file), specifier);
  return (
    [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(ts.sys.fileExists) ?? null
  );
}

export function checkServerOwnership(root = repositoryRoot) {
  const sourceRoot = join(root, "apps/server/src");
  const files = sourceFiles(sourceRoot);
  const errors = [];
  const graph = new Map();
  const layer = (file) => relative(sourceRoot, file).split("/")[0];
  for (const file of files) {
    const name = relative(sourceRoot, file);
    if (name.startsWith("test-support/")) continue;
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const edges = [];
    for (const dependency of imports(source)) {
      const target = localModule(file, dependency.specifier);
      const owner = target && relative(sourceRoot, target);
      const report = (message) => errors.push(`${name}: ${message} (${dependency.specifier})`);
      if (
        name.startsWith("services/") &&
        (owner?.startsWith("routes/") || /^(?:hono)(?:\/|$)/.test(dependency.specifier))
      ) {
        report("services must not depend on HTTP adapters");
      }
      if (
        name.startsWith("routes/") &&
        (owner?.startsWith("infrastructure/database/") ||
          /^drizzle-orm(?:\/|$)/.test(dependency.specifier))
      ) {
        report("routes must call services instead of database machinery");
      }
      if (name.startsWith("infrastructure/") && /^(?:services|routes|app)\//.test(owner ?? "")) {
        report("infrastructure must not depend on application or domain owners");
      }
      if (
        name.startsWith("shared/") &&
        !dependency.typeOnly &&
        /^(?:services|routes|app|infrastructure)\//.test(owner ?? "")
      ) {
        report("shared runtime support must remain independent");
      }
      if (owner?.startsWith("test-support/")) report("production must not import test support");
      if (
        /^@zilobase\/runtime-adapter\/(?:node|worker)(?:\/|$)/.test(dependency.specifier) &&
        /^(?:services|routes)\//.test(name)
      )
        report("domain code must use runtime capabilities");
      if (target && !dependency.typeOnly && target.startsWith(`${sourceRoot}/`)) edges.push(target);
    }
    graph.set(file, edges);
    if (
      !name.startsWith("public/") &&
      name !== "infrastructure/database/schema.ts" &&
      source.statements.length &&
      source.statements.every(
        (node) => ts.isImportDeclaration(node) || ts.isExportDeclaration(node),
      )
    ) {
      errors.push(`${name}: forwarding-only module; import its implementation owners directly`);
    }
    if (name.startsWith("routes/") && name.split("/").length === 2) {
      errors.push(`${name}: HTTP modules must belong to a domain folder`);
    }
  }
  // Strongly connected components distinguish real cycles from converging dependencies.
  let nextIndex = 0;
  const indexes = new Map(),
    lows = new Map(),
    stack = [],
    active = new Set();
  function visit(file) {
    indexes.set(file, nextIndex);
    lows.set(file, nextIndex++);
    stack.push(file);
    active.add(file);
    for (const target of graph.get(file) ?? []) {
      if (!indexes.has(target)) {
        visit(target);
        lows.set(file, Math.min(lows.get(file), lows.get(target)));
      } else if (active.has(target)) lows.set(file, Math.min(lows.get(file), indexes.get(target)));
    }
    if (lows.get(file) !== indexes.get(file)) return;
    const component = [];
    let member;
    do {
      member = stack.pop();
      active.delete(member);
      component.push(member);
    } while (member !== file);
    if (component.length > 1 && new Set(component.map(layer)).size > 1) {
      errors.push(
        `cross-layer runtime cycle: ${component
          .map((item) => relative(sourceRoot, item))
          .sort()
          .join(", ")}`,
      );
    }
  }
  for (const file of graph.keys()) if (!indexes.has(file)) visit(file);
  return errors.sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkServerOwnership();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log("Backend folders, dependencies, and runtime ownership are clean");
}
