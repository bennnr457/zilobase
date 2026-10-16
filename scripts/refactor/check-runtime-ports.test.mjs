import { checkWebOwnership } from "./check-web-ownership.mjs";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkRuntimeBoundaries } from "./check-runtime-ports.mjs";

test("domain boundary rejects runtime providers and ambient adapters", async () => {
  const root = await mkdtemp(join(tmpdir(), "runtime-ports-boundary-"));
  try {
    await mkdir(join(root, "apps/server/src/services/example"), { recursive: true });
    await mkdir(join(root, "apps/server/src/infrastructure/runtime"), { recursive: true });
    await mkdir(join(root, "packages/features/src/example"), { recursive: true });
    await mkdir(join(root, "packages/runtime-adapter/src/example"), { recursive: true });
    await writeFile(
      join(root, "apps/server/src/services/example/bad.ts"),
      'import "@zilobase/runtime-adapter/worker"; getRuntimeAdapter();\n',
    );
    await writeFile(
      join(root, "packages/features/src/example/good.ts"),
      'export const publish = (ports, value) => ports.fanout.publish("x", value);\n',
    );
    await writeFile(
      join(root, "packages/runtime-adapter/src/example/bad.ts"),
      "setRuntimePorts({}); type OptionalBus = NodeRealtimeBus | null;\n",
    );
    await writeFile(
      join(root, "apps/server/src/infrastructure/runtime/runtime-adapter.ts"),
      'export * from "@zilobase/runtime-adapter";\n',
    );
    assert.deepEqual(checkRuntimeBoundaries(root), [
      "apps/server/src/services/example/bad.ts: ambient runtime adapter",
      "apps/server/src/services/example/bad.ts: Worker runtime provider import",
      "packages/runtime-adapter/src/example/bad.ts: ambient runtime port setter",
      "packages/runtime-adapter/src/example/bad.ts: nullable Node realtime bus",
      "apps/server/src/infrastructure/runtime/runtime-adapter.ts: retired runtime compatibility shim",
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("application source ownership rejects retired folders", async () => {
  const root = await mkdtemp(join(tmpdir(), "source-ownership-boundary-"));
  const folders = ["apps/web/src/features", "apps/web/src/shared", "apps/server/src/features"];
  try {
    for (const folder of folders) {
      await mkdir(join(root, folder), { recursive: true });
      await writeFile(join(root, folder, "misplaced.ts"), "export const value = 1;\n");
    }
    assert.deepEqual(
      checkRuntimeBoundaries(root),
      folders.map((folder) => `${folder}: retired application source folder`),
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("web ownership rejects retired imports, forwarding files, misplaced page owners and unclear screens", async () => {
  const root = await mkdtemp(join(tmpdir(), "web-ownership-"));
  const files = {
    "components/pages/pane/legacy.tsx": "export const Legacy = () => null;",
    "components/pages/item-sharing.tsx": "export const Share = () => null;",
    "components/pages/header/page-layout.tsx": "export const PageLayout = () => null;",
    "components/sharing/index.ts": 'export { SharePopover } from "./share-popover";',
    "components/sharing/share-popover.tsx": "export const SharePopover = () => null;",
    "components/navigation/forward.ts": 'export { SharePopover } from "../sharing/share-popover";',
    "components/navigation/breadcrumbs.tsx":
      'import { Legacy } from "@/components/pages/pane/legacy"; export const Breadcrumbs = Legacy;',
    "components/pages/page.tsx": "export default function Page() { return null; }",
    "app/routing/router.tsx":
      'const route = { component: lazyRouteComponent(() => import("@/components/pages/page")) };',
  };
  try {
    for (const [name, contents] of Object.entries(files)) {
      const path = join(root, "apps/web/src", name);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, contents);
    }
    const errors = checkWebOwnership(root).join("\n");
    assert.match(errors, /retired web folder/);
    assert.match(errors, /retired import/);
    assert.match(errors, /belongs at components\/pages\/layout\/page-layout/);
    assert.match(errors, /use an explicit module name/);
    assert.match(errors, /forwarding-only module/);
    assert.match(errors, /route component must use a screen module/);
    assert.match(errors, /route component name must end in Screen/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("web ownership accepts direct owners, named route screens and type imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "web-ownership-valid-"));
  const files = {
    "components/pages/layout/page-layout.tsx": "export const PageLayout = () => null;",
    "components/pages/page-screen.tsx":
      'import type { PageLayout } from "./layout/page-layout"; export default function PageScreen() { return null; }',
    "app/routing/router.tsx":
      'const route = { component: lazyRouteComponent(() => import("@/components/pages/page-screen")) };',
  };
  try {
    for (const [name, contents] of Object.entries(files)) {
      const path = join(root, "apps/web/src", name);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, contents);
    }
    assert.deepEqual(checkWebOwnership(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page editor ownership rejects scattered implementations and accepts nested subsystem APIs", async () => {
  const root = await mkdtemp(join(tmpdir(), "page-editor-ownership-"));
  const source = join(root, "apps/web/src");
  try {
    const files = {
      "components/editor/editor.tsx": "export const Editor = () => null;",
      "components/comments/page-comments.tsx": "export const Comments = () => null;",
      "components/pages/content/page-content.tsx": "export const PageContent = () => null;",
      "components/pages/editor/composition/old.ts": "export const value = 1;",
      "components/pages/editor/core/old.ts": "export const value = 1;",
      "components/pages/editor/runtime/comment-selection.ts": "export const selection = 1;",
      "components/pages/editor/toolbar/toolbar-data.ts": "export const groups = [];",
      "components/databases/page-properties/page-metadata.tsx":
        "export const PageMetadata = () => null;",
      "components/pages/page-screen.tsx":
        'import { PageContent } from "./content/page-content"; export default function PageScreen() { return null; }',
    };
    for (const [name, contents] of Object.entries(files)) {
      const path = join(source, name);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, contents);
    }
    const errors = checkWebOwnership(root).join("\n");
    for (const name of Object.keys(files).filter((name) => !name.endsWith("page-screen.tsx")))
      assert.ok(errors.includes(name), name);
    assert.match(errors, /retired import/);
    assert.match(errors, /belongs at components\/pages\/editor\/comments\/comment-selection.ts/);
    await rm(source, { recursive: true, force: true });
    const owners = {
      "components/pages/editor/page-content.tsx": "export const PageContent = () => null;",
      "components/pages/editor/operations/page-content-recovery.ts":
        "export const recover = () => null;",
      "components/pages/editor/use-page-title-draft.ts":
        "export const usePageTitleDraft = () => null;",
      "components/pages/editor/comments/comments-context.tsx":
        "export const Comments = () => null;",
      "components/pages/page-metadata.tsx": "export const PageMetadata = () => null;",
      "components/pages/page-read-cache.ts": "export const hydrate = () => null;",
      "components/pages/editor/drag-drop/block-drag.ts":
        'export { dropEditorBlock } from "./block-drop";',
      "components/pages/editor/drag-drop/block-drop.ts":
        "export const dropEditorBlock = () => null;",
      "components/pages/editor/hosted/bootstrap.tsx":
        'import { PageContent } from "../page-content"; export const bootstrap = PageContent;',
    };
    for (const [name, contents] of Object.entries(owners)) {
      const path = join(source, name);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, contents);
    }
    assert.deepEqual(checkWebOwnership(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
