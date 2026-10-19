import { useEffect, useRef, useState } from "react";
import { usePrepareChatContext } from "@zilobase/features/ai/react";
import type { LocalPageSnapshot } from "@zilobase/features/ai";
import type { BuildContextResult, ResourceRef } from "@zilobase/page-context";
import type { AppSearchResult } from "@zilobase/features/search";
import { usePageEditorRegistry } from "@/sections/pages/editor/runtime/components/page-editor-registry";

export function useChatAttachments(workspaceId: string | null) {
  const [attachments, setAttachments] = useState<AppSearchResult[]>([]);
  const [preview, setPreview] = useState<BuildContextResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const prepare = usePrepareChatContext();
  const registry = usePageEditorRegistry();
  useEffect(() => () => active.current?.abort(), []);
  const cancel = () => {
    active.current?.abort();
    active.current = null;
    setBusy(false);
  };
  const add = (item: AppSearchResult) => {
    cancel();
    setPreview(null);
    setError(null);
    setAttachments((items) =>
      items.some((entry) => entry.id === item.id && entry.type === item.type)
        ? items
        : [...items, item].slice(0, 20),
    );
  };
  const remove = (item: ResourceRef) => {
    cancel();
    setPreview(null);
    setError(null);
    setAttachments((items) =>
      items.filter((entry) => entry.id !== item.id || entry.type !== item.type),
    );
  };
  const build = async () => {
    if (!workspaceId) throw new Error("Select a workspace first");
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(null);
    const roots = attachments.map(({ id, type }) => ({ id, type }));
    const snapshots: LocalPageSnapshot[] = roots.flatMap((root) => {
      if (root.type !== "page") return [];
      const content = registry.getEditorHandle(root.id)?.getContentJson();
      return content == null
        ? []
        : [
            {
              pageId: root.id,
              content: structuredClone(content),
              capturedAt: new Date().toISOString(),
            },
          ];
    });
    try {
      const result = await prepare({ workspaceId, roots, snapshots, signal: controller.signal });
      controller.signal.throwIfAborted();
      setPreview(result);
      if (result.status === "blocked") throw new Error(result.omissions.join(" "));
      return { result, roots, snapshots };
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Could not prepare context");
      throw cause;
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  };
  return { attachments, setAttachments, preview, busy, error, add, remove, build, cancel };
}
