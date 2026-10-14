import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
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
    providerModules: files.filter((path) =>
      /(?:function|const|class)\s+\w*Provider\b/.test(readFileSync(join(root, path), "utf8")),
    ).length,
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
