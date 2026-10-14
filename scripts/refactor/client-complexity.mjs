import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve, dirname } from "node:path";
import ts from "typescript";

const root = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../../", import.meta.url));
function sources(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory()
      ? sources(path)
      : /\.(ts|tsx)$/.test(path) && !/\.(test|spec)\./.test(path)
        ? [path]
        : [];
  });
}
function measure(directory) {
  const files = sources(directory);
  return {
    implementationFiles: files.length,
    ...cycles(files),
    forwardingModules: files.filter((path) => {
      const source = readFileSync(join(root, path), "utf8")
        .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")
        .trim();
      return (
        source &&
        !source
          .replace(/export\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+["'][^"']+["'];?/g, "")
          .trim()
      );
    }).length,
    providerComponents: files.reduce(
      (count, path) =>
        count +
        [
          ...readFileSync(join(root, path), "utf8").matchAll(
            /(?:function|const|class)\s+\w*Provider\b/g,
          ),
        ].length,
      0,
    ),
    providerModules: files.filter((path) =>
      /(?:function|const|class)\s+\w*Provider\b/.test(readFileSync(join(root, path), "utf8")),
    ).length,
  };
}
function cycles(files) {
  const members = new Set(files.map((path) => join(root, path)));
  const edges = new Map([...members].map((path) => [path, []]));
  for (const path of members) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      if (statement.isTypeOnly || statement.importClause?.isTypeOnly) continue;
      const bindings = statement.importClause?.namedBindings;
      if (
        !statement.importClause?.name &&
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.every((item) => item.isTypeOnly)
      )
        continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      const base = specifier.text.startsWith(".")
        ? resolve(dirname(path), specifier.text)
        : specifier.text.startsWith("@/")
          ? join(root, "apps/web/src", specifier.text.slice(2))
          : null;
      if (!base) continue;
      const target = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}/index.ts`,
        `${base}/index.tsx`,
      ].find((candidate) => members.has(candidate));
      if (target) edges.get(path).push(target);
    }
  }
  let next = 0;
  const index = new Map(),
    low = new Map(),
    stack = [],
    active = new Set(),
    components = [];
  function visit(path) {
    index.set(path, next);
    low.set(path, next++);
    stack.push(path);
    active.add(path);
    for (const target of edges.get(path)) {
      if (!index.has(target)) {
        visit(target);
        low.set(path, Math.min(low.get(path), low.get(target)));
      } else if (active.has(target)) low.set(path, Math.min(low.get(path), index.get(target)));
    }
    if (low.get(path) !== index.get(path)) return;
    const component = [];
    let member;
    do {
      member = stack.pop();
      active.delete(member);
      component.push(member);
    } while (member !== path);
    if (component.length > 1 || edges.get(path).includes(path)) components.push(component);
  }
  for (const path of members) if (!index.has(path)) visit(path);
  return {
    dependencyCycles: components.length,
    cyclicModules: components.flat().length,
    cyclicEdges: components.reduce(
      (count, component) =>
        count +
        component.reduce(
          (sum, path) =>
            sum + edges.get(path).filter((target) => component.includes(target)).length,
          0,
        ),
      0,
    ),
  };
}
console.log(
  JSON.stringify(
    {
      features: measure("packages/features/src"),
      web: measure("apps/web/src"),
      publicEntrypoints: Object.keys(
        JSON.parse(readFileSync(join(root, "packages/features/package.json"), "utf8")).exports,
      ).length,
    },
    null,
    2,
  ),
);
