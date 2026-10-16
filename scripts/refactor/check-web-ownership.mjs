import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import ts from "typescript";

const retiredFolders = [
  "components/pages/pane",
  "components/pages/publication",
  "components/pages/cache",
  "components/pages/hooks",
  "components/pages/images",
  "components/pages/icons",
  "components/databases/core",
  "components/databases/access",
  "components/databases/schema",
  "components/databases/records",
  "components/databases/setup/components",
  "components/databases/setup/model",
  "components/databases/views/components",
  "components/databases/views/view-settings",
  "components/editor",
  "components/comments",
  "components/pages/content",
  "components/pages/editor/composition",
  "components/ai/elements",
  "components/ai/files",
  "components/workspaces/members/components",
  "components/workspaces/members/commands",
  "components/workspaces/members/model",
  "components/workspaces/guests/components",
  "components/teamspaces/commands",
  "components/teamspaces/model",
  "components/teamspaces/creation",
  "components/settings/model",
  "components/notion-import/hooks",
  "components/desktop/pages",
];
const retiredModules = new Set([
  "components/pages/item-sharing",
  "components/pages/use-item-sharing",
  "components/pages/item-actions",
  "components/pages/use-item-actions",
  "components/pages/page",
  "components/pages/accept-page-invitation",
  "components/pages/navigation/open-page-options",
  "components/pages/navigation/route-item-id",
  "components/pages/layout/layout-editor",
  "components/pages/layout/layout-editor-settings",
  "components/pages/layout/layout-apply-dialog",
  "components/pages/layout/page-layout-sidebar",
  "app/shell/app-layout",
  "app/shell/app-header",
  "app/shell/panels/right-sidebars",
  "components/desktop/ui",
  "lib/page-icon-utils",
]);
const isRetired = (name) =>
  retiredModules.has(name.replace(/\.[cm]?[jt]sx?$/, "")) ||
  retiredFolders.some((folder) => name === folder || name.startsWith(`${folder}/`));

// Existing named entrypoints for substantial drag/drop subsystems remain public.
// The migration removes index/UI forwarding shims without flattening these APIs.
const subsystemEntrypoints = new Set([
  "components/databases/interactions/database-row-drag.ts",
  "components/pages/editor/drag-drop/block-drag.ts",
]);

const pageOwners = new Map([
  ["page-layout.tsx", "layout"],
  ["page-header.tsx", "header"],
  ["public-page-header.tsx", "header"],
  ["page-content.tsx", "editor"],
  ["page-content-recovery.ts", "editor/operations"],
  ["page-read-cache.ts", ""],
  ["use-page-title-draft.ts", "editor"],
  ["page-presentation.tsx", "presentation"],
  ["page-side-pane.tsx", "presentation"],
  ["page-dialog.tsx", "presentation"],
  ["page-opening-mode-menu.tsx", "presentation"],
  ["page-navigation.ts", "navigation"],
  ["page-navigation-timing.ts", "navigation"],
  ["page-design-editor.tsx", "design"],
  ["page-design-settings.tsx", "design"],
  ["page-design-sidebar.tsx", "design"],
]);

export function checkWebOwnership(repositoryRoot) {
  const src = join(repositoryRoot, "apps/web/src");
  const errors = [];
  for (const file of sourceFiles(src)) {
    const name = relative(src, file).replaceAll("\\", "/");
    const label = `apps/web/src/${name}`;
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    if (isRetired(name)) errors.push(`${label}: retired web folder`);
    if (/^index\.[cm]?[jt]sx?$/.test(basename(file)))
      errors.push(`${label}: use an explicit module name`);
    else if (
      !subsystemEntrypoints.has(name) &&
      source.statements.length &&
      source.statements.every((node) => ts.isExportDeclaration(node) && node.moduleSpecifier)
    )
      errors.push(`${label}: forwarding-only module`);
    if (name.startsWith("components/pages/") && pageOwners.has(basename(file))) {
      const expected = ["components/pages", pageOwners.get(basename(file)), basename(file)]
        .filter(Boolean)
        .join("/");
      if (name !== expected) errors.push(`${label}: belongs at ${expected}`);
    }
    const imports = [];
    const routeImports = [];
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "lazyRouteComponent"
      ) {
        const collect = (child) => {
          if (
            ts.isCallExpression(child) &&
            child.expression.kind === ts.SyntaxKind.ImportKeyword &&
            ts.isStringLiteral(child.arguments[0])
          )
            routeImports.push(child.arguments[0].text);
          ts.forEachChild(child, collect);
        };
        collect(node);
      }

      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        imports.push(node.moduleSpecifier.text);
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        ts.isStringLiteral(node.arguments[0])
      )
        imports.push(node.arguments[0].text);
      if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      )
        imports.push(node.argument.literal.text);
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const specifier of new Set(imports)) {
      const path = specifier.startsWith("@/")
        ? join(src, specifier.slice(2))
        : specifier.startsWith(".")
          ? resolve(file, "..", specifier)
          : null;
      if (!path || !path.startsWith(`${src}/`)) continue;
      const target = relative(src, path).replaceAll("\\", "/");
      if (isRetired(target)) errors.push(`${label}: retired import ${specifier}`);
      else if (
        !["", ".ts", ".tsx", ".mjs", ".js", ".css"].some(
          (ext) =>
            existsSync(path.split("?")[0] + ext) && statSync(path.split("?")[0] + ext).isFile(),
        )
      )
        errors.push(`${label}: unresolved direct import ${specifier}`);
    }
    if (name === "app/routing/router.tsx") {
      for (const specifier of routeImports.filter((value) => value.startsWith("@/components/"))) {
        if (!specifier.endsWith("-screen"))
          errors.push(`${label}: route component must use a screen module: ${specifier}`);
        const screen = join(src, specifier.slice(2) + ".tsx");
        if (!existsSync(screen)) continue;
        const ast = ts.createSourceFile(
          screen,
          readFileSync(screen, "utf8"),
          ts.ScriptTarget.Latest,
          true,
        );
        const declaration = ast.statements.find(
          (node) =>
            ts.isFunctionDeclaration(node) &&
            node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword),
        );
        if (declaration?.name && !declaration.name.text.endsWith("Screen"))
          errors.push(
            `${relative(repositoryRoot, screen)}: route component name must end in Screen`,
          );
      }
    }
  }
  return errors;
}

function sourceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.[cm]?[jt]sx?$/.test(entry.name)
        ? [path]
        : [];
  });
}
