import { useState } from "react";
import type { ResourceRef } from "@zilobase/page-context";
import type { AppSearchResult } from "@zilobase/features/search";

/** Mentions identify sources. Content is read only by server tools. */
export function useChatAttachments() {
  const [attachments, setAttachments] = useState<AppSearchResult[]>([]);
  const add = (item: AppSearchResult) =>
    setAttachments((items) =>
      items.some((entry) => entry.id === item.id && entry.type === item.type)
        ? items
        : [...items, item].slice(0, 20),
    );
  const remove = (item: ResourceRef) =>
    setAttachments((items) =>
      items.filter((entry) => entry.id !== item.id || entry.type !== item.type),
    );
  return {
    attachments,
    setAttachments,
    add,
    remove,
    replace: setAttachments,
    reset: () => setAttachments([]),
  };
}
