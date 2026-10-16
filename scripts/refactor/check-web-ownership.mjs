import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import ts from "typescript";

const moduleOwners = new Map([
  ["app-search.tsx", "app/shell/search/components/app-search.tsx"],
  ["notification-center.tsx", "app/shell/notifications/components/notification-center.tsx"],
  ["fallback-error-boundary.tsx", "app/routing/components/fallback-error-boundary.tsx"],
  ["posthog.ts", "platform/analytics/posthog.ts"],
  ["google-auth.ts", "platform/auth/google-auth.ts"],
  ["calendar-database.ts", "platform/storage/calendar-database.ts"],
  ["calendar-reminders.ts", "platform/storage/calendar-reminders.ts"],
  ["calendar-notifications.ts", "platform/notifications/calendar-notifications.ts"],
  ["calendar-metrics.ts", "platform/diagnostics/calendar-metrics.ts"],
  ["database-metrics.ts", "platform/diagnostics/database-metrics.ts"],
  ["database-write-guard.ts", "platform/browser/database-write-guard.ts"],
  ["capture-runtime.ts", "platform/meetings/capture-runtime.ts"],
  ["capture-types.ts", "platform/meetings/capture-types.ts"],
  [
    "meeting-block-navigation.ts",
    "sections/pages/editor/extensions/meeting/lib/meeting-block-navigation.ts",
  ],
  ["demo-experience.tsx", "app/demo/components/demo-experience.tsx"],
  ["library-views.ts", "components/navigation/lib/library-views.ts"],
  ["search-result-destination.ts", "app/routing/search-result-destination.ts"],
  ["browser-audio-processing.ts", "platform/browser/meetings/browser-audio-processing.ts"],
  ["browser-capture-runtime.ts", "platform/browser/meetings/browser-capture-runtime.ts"],
  ["browser-meeting-capture.ts", "platform/browser/meetings/browser-meeting-capture.ts"],
  ["browser-meeting-recovery.ts", "platform/browser/meetings/browser-meeting-recovery.ts"],
  ["browser-meeting-transport.ts", "platform/browser/meetings/browser-meeting-transport.ts"],
  ["route-identifiers.ts", "app/routing/route-identifiers.ts"],
  ["start-destination.ts", "app/routing/start-destination.ts"],
]);
const routeFunctionOwners = new Map([
  ["normalizeTeamSettingsTab", "app/routing/search-validators.ts"],
  ["isTeamspaceSettingsTab", "app/routing/search-validators.ts"],
  ["getPageId", "app/routing/route-identifiers.ts"],
  ["getDatabaseId", "app/routing/route-identifiers.ts"],
  ["getMeetingId", "app/routing/route-identifiers.ts"],
  ["getNavigationItemPath", "app/routing/route-identifiers.ts"],
  ["getActivePageId", "app/routing/route-identifiers.ts"],
  ["getActiveDatabaseId", "app/routing/route-identifiers.ts"],
  ["getActiveMeetingId", "app/routing/route-identifiers.ts"],
  ["getActiveDatabaseViewId", "app/routing/route-identifiers.ts"],
  ["getSearchResultDestination", "app/routing/search-result-destination.ts"],
  ["getMostRecentItemPath", "app/routing/start-destination.ts"],
]);

const sharedComponentGroups = new Set(["ui", "branding", "navigation", "sharing"]);
const retiredFolders = [
  "sections/pages/pane",
  "sections/pages/publication",
  "sections/pages/cache",
  "sections/pages/images",
  "sections/pages/icons",
  "sections/databases/core",
  "sections/databases/access",
  "sections/databases/schema",
  "sections/databases/records",
  "sections/databases/setup/model",
  "sections/databases/views/view-settings",
  "sections/editor",
  "sections/comments",
  "sections/pages/content",
  "sections/pages/editor/composition",
  "sections/pages/editor/core",
  "sections/ai/elements",
  "sections/ai/files",
  "sections/workspaces/members/commands",
  "sections/workspaces/members/model",
  "sections/teamspaces/commands",
  "sections/teamspaces/model",
  "sections/teamspaces/creation",
  "sections/settings/model",
  "sections/desktop/pages",
  "lib/hooks",
];
const moduleOwner = (name) => name.replace(/\/(?:components|hooks|lib)(?=\/)/g, "");
const retiredModules = new Set(
  [
    "sections/databases/page-properties/page-metadata",
    "sections/pages/editor/commands/use-editor-database-actions",
    "sections/pages/editor/commands/use-editor-meeting-actions",
    "sections/pages/editor/commands/run-toolbar-command",
    "sections/pages/editor/toolbar/lib/toolbar-contracts",
    "sections/pages/editor/toolbar/lib/toolbar-data",
    "sections/pages/editor/comments/page-comments-registry",
    "sections/pages/editor/comments/page-editor-comments",
    "sections/pages/editor/runtime/use-latest-ref",
    "sections/teamspaces/lib/teamspace-settings",
    "sections/pages/item-sharing",
    "sections/pages/use-item-sharing",
    "sections/pages/item-actions",
    "sections/pages/use-item-actions",
    "sections/pages/page",
    "sections/pages/accept-page-invitation",
    "sections/pages/navigation/open-page-options",
    "sections/pages/navigation/route-item-id",
    "sections/pages/layout/layout-editor",
    "sections/pages/layout/layout-editor-settings",
    "sections/pages/layout/layout-apply-dialog",
    "sections/pages/layout/page-layout-sidebar",
    "app/shell/app-layout",
    "app/shell/app-header",
    "app/shell/panels/right-sidebars",
    "sections/desktop/ui",
    "lib/page-icon-utils",
    "lib/posthog",
    "sections/auth/lib/google-auth",
    "sections/calendar/storage/lib/calendar-database",
    "sections/calendar/reminders/lib/scheduler",
    "sections/calendar/reminders/lib/notification-delivery",
    "sections/calendar/lib/metrics",
    "sections/databases/lifecycle/lib/metrics",
    "sections/databases/lifecycle/lib/beforeunload",
    "sections/meetings/capture/lib/capture-runtime",
    "sections/meetings/capture/lib/types",
    "sections/meetings/lib/meeting-navigation",
    "sections/demo/components/demo-experience",
    "sections/library/components/library-icons",
    "sections/search/lib/search-results",
    "sections/meetings/capture/lib/browser-audio-processing",
    "sections/meetings/capture/lib/browser-capture-runtime",
    "sections/meetings/capture/lib/browser-meeting-capture",
    "sections/meetings/capture/lib/browser-meeting-recovery",
    "sections/meetings/capture/lib/browser-meeting-transport",
  ].map(moduleOwner),
);
const isRetired = (name) =>
  (name.startsWith("components/") &&
    name.split("/").length > 2 &&
    !sharedComponentGroups.has(name.split("/")[1])) ||
  retiredModules.has(moduleOwner(name.replace(/\.[cm]?[jt]sx?$/, ""))) ||
  retiredFolders.some((folder) => name === folder || name.startsWith(`${folder}/`));

// Existing named entrypoints for substantial drag/drop subsystems remain public.
// The migration removes index/UI forwarding shims without flattening these APIs.
const subsystemEntrypoints = new Set([
  "sections/databases/interactions/lib/database-row-drag.ts",
  "sections/pages/editor/drag-drop/lib/block-drag.ts",
]);

const pageOwners = new Map([
  ["editor.tsx", "editor"],
  ["editor-chrome.tsx", "editor/components"],
  ["editor-types.ts", "editor/lib"],
  ["create-base-extensions.ts", "editor/extensions/lib"],
  ["use-editor-extensions.ts", "editor/runtime/hooks"],
  ["editor-table-of-contents.tsx", "editor/toolbar/components"],
  ["database-block-drop-dialog.tsx", "editor/drag-drop/components"],
  ["comments-context.tsx", "editor/comments/components"],
  ["comment-extension.ts", "editor/extensions/lib"],
  ["editor-integration.ts", "editor/extensions/lib"],
  ["structural-commands.ts", "editor/extensions/lib"],
  ["pending-page-embed.ts", "editor/extensions/lib"],
  ["database-block.tsx", "editor/extensions/components"],
  ["comment-selection.ts", "editor/comments/lib"],
  ["block-comment-popover.tsx", "editor/comments/components"],
  ["page-metadata.tsx", "components"],
  ["page-layout.tsx", "layout/components"],
  ["page-header.tsx", "header/components"],
  ["public-page-header.tsx", "header/components"],
  ["page-content.tsx", "editor"],
  ["page-content-recovery.ts", "editor/operations/lib"],
  ["page-read-cache.ts", "lib"],
  ["use-page-title-draft.ts", "editor/hooks"],
  ["page-presentation.tsx", "presentation/components"],
  ["page-side-pane.tsx", "presentation/components"],
  ["page-dialog.tsx", "presentation/components"],
  ["page-opening-mode-menu.tsx", "presentation/components"],
  ["page-navigation.ts", "navigation/hooks"],
  ["page-navigation-timing.ts", "navigation/lib"],
  ["page-design-editor.tsx", "design/components"],
  ["page-design-settings.tsx", "design/components"],
  ["page-design-sidebar.tsx", "design/components"],
]);

function declaresTiptapExtension(source) {
  const constructors = new Set();
  const extensions = new Set();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    const specifier = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (
      specifier === "@tiptap/core" &&
      clause?.namedBindings &&
      ts.isNamedImports(clause.namedBindings)
    ) {
      for (const binding of clause.namedBindings.elements) {
        if (["Extension", "Node", "Mark"].includes((binding.propertyName ?? binding.name).text)) {
          constructors.add(binding.name.text);
          extensions.add(binding.name.text);
        }
      }
    } else if (
      specifier.startsWith("@tiptap/extension-") ||
      specifier.startsWith("tiptap-extension-")
    ) {
      if (clause?.name) extensions.add(clause.name.text);
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings))
        for (const binding of clause.namedBindings.elements) extensions.add(binding.name.text);
    }
  }
  let found = false;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const { expression, name } = node.expression;
      if (ts.isIdentifier(expression))
        found ||=
          (name.text === "create" && constructors.has(expression.text)) ||
          (name.text === "extend" && extensions.has(expression.text));
    }
    if (!found) ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

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
    if (!name.startsWith("sections/pages/editor/extensions/") && declaresTiptapExtension(source))
      errors.push(`${label}: Tiptap extensions belong in sections/pages/editor/extensions/`);
    const expectedOwner = moduleOwners.get(basename(file));
    if (expectedOwner && name !== expectedOwner)
      errors.push(`${label}: belongs at ${expectedOwner}`);
    for (const node of source.statements) {
      const expected = ts.isFunctionDeclaration(node) && routeFunctionOwners.get(node.name?.text);
      if (expected && name !== expected)
        errors.push(`${label}: ${node.name.text} belongs at ${expected}`);
    }

    if (/^index\.[cm]?[jt]sx?$/.test(basename(file)))
      errors.push(`${label}: use an explicit module name`);
    else if (
      !subsystemEntrypoints.has(name) &&
      source.statements.length &&
      source.statements.every((node) => ts.isExportDeclaration(node) && node.moduleSpecifier)
    )
      errors.push(`${label}: forwarding-only module`);
    if (name.startsWith("sections/pages/") && pageOwners.has(basename(file))) {
      const expected = ["sections/pages", pageOwners.get(basename(file)), basename(file)]
        .filter(Boolean)
        .join("/");
      if (name !== expected) errors.push(`${label}: belongs at ${expected}`);
    }
    if (name.startsWith("sections/")) {
      const parent = basename(join(file, ".."));
      const entrypoint =
        name.endsWith("-screen.tsx") ||
        [
          "sections/pages/editor/editor.tsx",
          "sections/pages/editor/page-content.tsx",
          "sections/pages/editor/hosted/bootstrap.tsx",
        ].includes(name);
      if (basename(file).startsWith("use-") && parent !== "hooks")
        errors.push(`${label}: local hooks belong in hooks/`);
      else if (name.endsWith(".tsx") && !entrypoint && !["components", "hooks"].includes(parent))
        errors.push(`${label}: local UI belongs in components/`);
      else if (name.endsWith(".ts") && !["lib", "hooks"].includes(parent))
        errors.push(`${label}: local helpers belong in lib/`);
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
      if (name.startsWith("platform/") && /^(?:app|sections|components|hooks)\//.test(target))
        errors.push(`${label}: platform adapters must not import UI/app modules: ${specifier}`);
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
      for (const specifier of routeImports.filter(
        (value) => value.startsWith("@/sections/") || value.startsWith("@/components/"),
      )) {
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
