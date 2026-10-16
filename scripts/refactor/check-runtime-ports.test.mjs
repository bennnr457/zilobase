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
    "sections/pages/header/components/page-layout.tsx": "export const PageLayout = () => null;",
    "components/sharing/index.ts": 'export { SharePopover } from "./share-popover";',
    "components/sharing/components/share-popover.tsx": "export const SharePopover = () => null;",
    "components/navigation/forward.ts": 'export { SharePopover } from "../sharing/share-popover";',
    "components/navigation/components/breadcrumbs.tsx":
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
    assert.match(errors, /belongs at sections\/pages\/layout\/components\/page-layout/);
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
    "sections/pages/layout/components/page-layout.tsx": "export const PageLayout = () => null;",
    "sections/pages/page-screen.tsx":
      'import type { PageLayout } from "./layout/components/page-layout"; export default function PageScreen() { return null; }',
    "app/routing/router.tsx":
      'const route = { component: lazyRouteComponent(() => import("@/sections/pages/page-screen")) };',
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
      "sections/pages/editor/runtime/lib/comment-selection.ts": "export const selection = 1;",
      "sections/pages/editor/toolbar/lib/toolbar-data.ts": "export const groups = [];",
      "components/databases/page-properties/page-metadata.tsx":
        "export const PageMetadata = () => null;",
      "sections/pages/page-screen.tsx":
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
    assert.match(errors, /belongs at sections\/pages\/editor\/comments\/lib\/comment-selection.ts/);
    await rm(source, { recursive: true, force: true });
    const owners = {
      "sections/pages/editor/page-content.tsx": "export const PageContent = () => null;",
      "sections/pages/editor/operations/lib/page-content-recovery.ts":
        "export const recover = () => null;",
      "sections/pages/editor/hooks/use-page-title-draft.ts":
        "export const usePageTitleDraft = () => null;",
      "sections/pages/editor/comments/components/comments-context.tsx":
        "export const Comments = () => null;",
      "sections/pages/components/page-metadata.tsx": "export const PageMetadata = () => null;",
      "sections/pages/lib/page-read-cache.ts": "export const hydrate = () => null;",
      "sections/pages/editor/drag-drop/lib/block-drag.ts":
        'export { dropEditorBlock } from "./block-drop";',
      "sections/pages/editor/drag-drop/lib/block-drop.ts":
        "export const dropEditorBlock = () => null;",
      "sections/pages/editor/hosted/bootstrap.tsx":
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

test("UI sections keep local components, hooks and helpers while root components stay shared", async () => {
  const root = await mkdtemp(join(tmpdir(), "section-ownership-"));
  const source = join(root, "apps/web/src");
  const valid = {
    "sections/calendar/calendar-screen.tsx":
      'import { EventEditor } from "./events/components/event-editor"; export default function CalendarScreen() { return EventEditor(); }',
    "sections/calendar/events/components/event-editor.tsx":
      'import { useEventDraft } from "../hooks/use-event-draft"; export const EventEditor = () => useEventDraft();',
    "sections/calendar/events/hooks/use-event-draft.ts":
      'import { formatEvent } from "../lib/format-event"; export const useEventDraft = () => formatEvent();',
    "sections/calendar/events/lib/format-event.ts": "export const formatEvent = () => null;",
    "components/ui/button.tsx": "export const Button = () => null;",
    "components/sharing/hooks/use-sharing.ts": "export const useSharing = () => null;",
    "hooks/use-mobile.ts": "export const useMobile = () => false;",
    "lib/utils.ts": "export const cn = () => null;",
    "app/routing/router.tsx":
      'const route = { component: lazyRouteComponent(() => import("@/sections/calendar/calendar-screen")) };',
  };
  try {
    for (const [name, contents] of Object.entries(valid)) {
      const path = join(source, name);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, contents);
    }
    assert.deepEqual(checkWebOwnership(root), []);
    const invalid = {
      "components/calendar/event.tsx": "export const Event = () => null;",
      "sections/calendar/event.tsx": "export const Event = () => null;",
      "sections/calendar/use-event.ts": "export const useEvent = () => null;",
      "sections/calendar/format-event.ts": "export const formatEvent = () => null;",
      "lib/hooks/use-legacy.ts": "export const useLegacy = () => null;",
      "sections/pages/editor/comments/components/page-comments-registry.tsx":
        "export const LegacyRegistry = () => null;",
    };
    for (const [name, contents] of Object.entries(invalid)) {
      const path = join(source, name);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, contents);
    }
    const errors = checkWebOwnership(root);
    for (const name of Object.keys(invalid))
      assert.ok(
        errors.some((error) => error.startsWith(`apps/web/src/${name}:`)),
        name,
      );
    assert.ok(errors.some((error) => error.includes("local UI belongs in components/")));
    assert.ok(errors.some((error) => error.includes("local hooks belong in hooks/")));
    assert.ok(errors.some((error) => error.includes("local helpers belong in lib/")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("platform implementations and route helpers stay with their owners", async () => {
  const root = await mkdtemp(join(tmpdir(), "platform-ui-ownership-"));
  const source = join(root, "apps/web/src");
  const valid = {
    "platform/storage/calendar-database.ts": "export const openCalendarDatabase = () => null;",
    "platform/meetings/capture-runtime.ts": "export const getMeetingCaptureRuntime = () => null;",
    "platform/browser/meetings/browser-capture-runtime.ts":
      'import { getMeetingCaptureRuntime } from "../../meetings/capture-runtime"; export const capture = getMeetingCaptureRuntime;',
    "sections/meetings/capture/hooks/use-meeting-capture.ts":
      'import { getMeetingCaptureRuntime } from "@/platform/meetings/capture-runtime"; export const useMeetingCapture = () => getMeetingCaptureRuntime();',
    "sections/calendar/calendar-screen.tsx":
      "export default function CalendarScreen() { return null; }",
    "components/navigation/lib/library-views.ts": "export const libraryViewLabels = {};",
    "app/routing/route-identifiers.ts": "export const getActiveMeetingId = () => null;",
    "app/demo/components/demo-experience.tsx": "export const DemoExperience = () => null;",
  };
  try {
    for (const [name, contents] of Object.entries(valid)) {
      const file = join(source, name);
      await mkdir(join(file, ".."), { recursive: true });
      await writeFile(file, contents);
    }
    assert.deepEqual(checkWebOwnership(root), []);
    const invalid = {
      "platform/storage/wrong-owner.ts":
        'import CalendarScreen from "@/sections/calendar/calendar-screen"; export const screen = CalendarScreen;',
      "platform/network/wrong-owner.ts":
        'import { libraryViewLabels } from "../../components/navigation/lib/library-views"; export const labels = libraryViewLabels;',
      "lib/posthog.ts": "export const captureProductException = () => null;",
      "app/shell/sidebar/hooks/misplaced-parser.ts":
        "export function getActiveMeetingId() { return null; }",
      "sections/library/components/library-icons.tsx": "export const libraryViewIcons = {};",
    };
    for (const [name, contents] of Object.entries(invalid)) {
      const file = join(source, name);
      await mkdir(join(file, ".."), { recursive: true });
      await writeFile(file, contents);
    }
    const errors = checkWebOwnership(root);
    for (const name of Object.keys(invalid))
      assert.ok(
        errors.some((error) => error.startsWith(`apps/web/src/${name}:`)),
        name,
      );
    assert.equal(
      errors.filter((error) => error.includes("platform adapters must not import")).length,
      2,
    );
    assert.ok(errors.some((error) => error.includes("belongs at platform/analytics/posthog.ts")));
    assert.ok(
      errors.some((error) =>
        error.includes("getActiveMeetingId belongs at app/routing/route-identifiers.ts"),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
