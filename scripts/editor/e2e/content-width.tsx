import "@/styles/global.css";
import "@/styles/app.css";
import { useCallback, useEffect, useState } from "react";
import * as Y from "yjs";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { ZilobaseFeaturesProvider, type ZilobaseAuthClient } from "@zilobase/features";
import { createDefaultPageLayout } from "@zilobase/features/pages";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { ShortcutProvider } from "@/app/shortcuts/shortcut-provider";
import { Editor } from "@/sections/pages/editor/editor";
import { PageEditorRegistryProvider } from "@/sections/pages/editor/runtime/components/page-editor-registry";
import {
  PageCommentsRegistryProvider,
  PageEditorCommentsProvider,
  usePageCommentsRegistry,
} from "@/sections/pages/editor/comments/components/comments-context";
import { createPageCommentController } from "@/sections/pages/editor/comments/lib/yjs-comments";

const features = {
  deployment: "width-test",
  queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  auth: {
    getSession: async () => ({ user: { id: "width-user", name: "Reader" }, session: null }),
  } as ZilobaseAuthClient,
  apiFetch: async () => ({ properties: [], values: [], members: [], pages: [] }),
};

function WidthFixture() {
  const [fullWidth, setFullWidth] = useState(false);
  const registry = usePageCommentsRegistry();
  useEffect(() => {
    const document = new Y.Doc();
    const controller = createPageCommentController({
      document,
      canEdit: true,
      canModerate: true,
      user: { id: "width-user", name: "Reader", email: null, image: null },
    });
    const unregister = registry.register("width-page", controller);
    return () => {
      unregister();
      controller.destroy();
      document.destroy();
    };
  }, [registry]);
  const params = new URLSearchParams(location.search);
  const onReady = useCallback((editor: TiptapEditor | null) => {
    Object.assign(window, { widthEditor: editor });
  }, []);
  const layout = createDefaultPageLayout();
  if (params.has("tabs")) layout.structure = "tabbed";
  return (
    <>
      <button onClick={() => setFullWidth((value) => !value)}>Toggle full width</button>
      <Editor
        session={{
          kind: "local",
          documentId: "width",
          pageId: "width-page",
          content: `<h2>One shared content column</h2><p>Text, comments and blocks share the same page edges.</p><pre><code>${"wide code ".repeat(80)}</code></pre><blockquote><p>A quote</p></blockquote><table><tbody><tr><td><p>Table content</p></td><td><p>Second cell</p></td></tr></tbody></table><hr /><p>Last paragraph</p>`,
        }}
        presentation={{
          title: "A consistent page width",
          fullWidth,
          layoutConfig: params.has("plain") ? undefined : layout,
        }}
        view={{ onEditorReady: onReady }}
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <ZilobaseFeaturesProvider value={features}>
    <ShortcutProvider>
      <PageCommentsRegistryProvider>
        <PageEditorCommentsProvider>
          <PageEditorRegistryProvider>
            <WidthFixture />
          </PageEditorRegistryProvider>
        </PageEditorCommentsProvider>
      </PageCommentsRegistryProvider>
    </ShortcutProvider>
  </ZilobaseFeaturesProvider>,
);
