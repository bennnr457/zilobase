import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const source = new URL("./", import.meta.url);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(entry.name, directory);
    return entry.isDirectory() ? files(new URL(`${entry.name}/`, directory)) : [url];
  });
}

test("shared client sources do not depend on web adapters or browser globals", () => {
  for (const file of files(source)) {
    if (!/\.tsx?$/.test(file.pathname) || /\.test\./.test(file.pathname)) continue;
    const text = readFileSync(file, "utf8");
    const name = fileURLToPath(file);
    assert.doesNotMatch(
      text,
      /(?:from\s*|import\s*\()["'](?:@\/|.*apps\/|@tiptap\/|@tanstack\/react-router|react-dom|dexie(?:-react-hooks)?|yjs|@hocuspocus\/|electron|sonner)/,
      name,
    );
    assert.doesNotMatch(
      text,
      /\b(?:document|localStorage|sessionStorage|indexedDB|navigator)\s*(?:\.|\[)/,
      name,
    );
    assert.doesNotMatch(
      text,
      /\bwindow\.(?:location|document|localStorage|sessionStorage|navigator|addEventListener|removeEventListener|setTimeout|clearTimeout|dispatchEvent|alert|confirm)\b/,
      name,
    );
    assert.doesNotMatch(text, /(?:from\s*|import\s*)["'][^"']+\.(?:css|scss)["']/, name);
  }
});

test("all public shared client entrypoints load without a browser", async () => {
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(typeof globalThis.document, "undefined");
  const manifest = JSON.parse(readFileSync(new URL("../package.json", source), "utf8"));
  for (const entry of Object.values(manifest.exports)) {
    await import(new URL(entry.default, new URL("../", source)).href);
  }
});

test("public imports expose one initialization path, domain APIs, domain hooks and one runtime entry", async () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", source), "utf8"));
  for (const entry of Object.keys(manifest.exports))
    assert.match(entry, /^(?:\.|\.\/[a-z-]+(?:\/react)?)$/, entry);
  assert.deepEqual(
    Object.keys(manifest.exports).filter((entry) => entry.startsWith("./runtime")),
    ["./runtime"],
  );
  const databaseHooks = await import("./databases/react.ts");
  assert.equal("DbProvider" in databaseHooks, false);
  assert.equal("getDatabaseRowMoveAnchors" in databaseHooks, false);
  const data = await import("./data/index.ts");
  assert.equal("installSharedClient" in data, false);
});
