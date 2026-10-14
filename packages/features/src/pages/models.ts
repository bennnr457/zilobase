import type { Page } from "./contracts";
import type { PageMetadata } from "./item-relationships";
type PageBodyNode = {
  content?: unknown;
  text?: unknown;
  type?: unknown;
};

export function isPageBodyEmpty(content: unknown): boolean {
  if (content == null) {
    return true;
  }

  if (typeof content === "string") {
    const trimmed = content.trim();

    if (!trimmed) {
      return true;
    }

    try {
      return isPageBodyEmpty(JSON.parse(trimmed) as unknown);
    } catch {
      return false;
    }
  }

  if (Array.isArray(content)) {
    return content.every(isPageBodyEmpty);
  }

  if (typeof content !== "object") {
    return false;
  }

  const node = content as PageBodyNode;

  if (node.type === "text") {
    return typeof node.text !== "string" || node.text.trim().length === 0;
  }

  if (
    node.type === "hardBreak" ||
    node.type === "paragraph" ||
    node.type === "heading" ||
    node.type === "doc" ||
    !node.type
  ) {
    return isPageBodyEmpty(node.content);
  }

  return false;
}

export function hasPageBodyContent(content: unknown): boolean {
  return !isPageBodyEmpty(content);
}

export function resolvePageEditability({
  readOnly,
  locked,
  deletedAt,
  accessLevel,
}: {
  readOnly: boolean;
  locked: boolean;
  deletedAt: unknown;
  accessLevel: string | null | undefined;
}) {
  const pageEditable =
    !readOnly && !locked && !deletedAt && (accessLevel === "edit" || accessLevel === "full");
  const commentsEditable =
    !readOnly &&
    !deletedAt &&
    (accessLevel === "comment" || accessLevel === "edit" || accessLevel === "full");
  return { pageEditable, commentsEditable };
}

export function getDuplicatePageName(name: string) {
  const trimmedName = name.trim() || "Untitled";

  return `${trimmedName} copy`;
}

export function clonePageContent(content: unknown) {
  const cloned =
    typeof structuredClone === "function"
      ? structuredClone(content)
      : (JSON.parse(JSON.stringify(content)) as unknown);

  return stripCommentMarks(cloned);
}

function stripCommentMarks(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCommentMarks);
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      key === "marks" && Array.isArray(child)
        ? child
            .filter(
              (mark) =>
                !mark ||
                typeof mark !== "object" ||
                (mark as { type?: unknown }).type !== "comment",
            )
            .map(stripCommentMarks)
        : stripCommentMarks(child),
    ]),
  );
}

export function buildPageDuplicateInput(page: Page, parentItemId: string | undefined) {
  const metadata = (page.metadata ?? {}) as PageMetadata;
  return {
    content: clonePageContent(page.content ?? null),
    emoji: metadata.emoji ?? undefined,
    metadata,
    name: getDuplicatePageName(page.name),
    workspaceId: page.workspaceId,
    parentItemId,
  };
}
