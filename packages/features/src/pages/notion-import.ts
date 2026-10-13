type CreatePageInput = {
  emoji?: string;
  name: string;
  parentItemId?: string;
  workspaceId: string;
};

type UpdatePageInput = {
  content: unknown;
  id: string;
};

export type ImportNotionPagesInput = {
  createPage: (input: CreatePageInput) => Promise<{ id: string }>;
  entries: { html: string; path: string }[];
  normalizeHtml: (
    html: string,
    options?: { pagePathMap: Map<string, string> },
  ) => {
    title: string;
    emoji?: string | null;
    content: unknown;
    skippedAssets: number;
    warnings: string[];
  };
  updatePage: (input: UpdatePageInput) => Promise<unknown>;
  workspaceId: string;
};

export type ImportNotionZipResult = {
  createdPageIds: string[];
  entryPageId: string | null;
  skippedAssets: number;
  warnings: string[];
};

export class NotionImportError extends Error {}

export async function importNotionPages({
  createPage,
  entries,
  normalizeHtml,
  updatePage,
  workspaceId,
}: ImportNotionPagesInput): Promise<ImportNotionZipResult> {
  const htmlEntries = entries.map((entry) => ({
    ...entry,
    parentPath: getParentPagePath(entry.path),
  }));
  const pageIdsByPath = new Map<string, string>();
  const createdPageIds: string[] = [];
  let skippedAssets = 0;
  const warnings: string[] = [];

  for (const entry of htmlEntries) {
    const parsed = normalizeHtml(entry.html);

    const parentItemId = entry.parentPath ? pageIdsByPath.get(entry.parentPath) : undefined;
    const page = await createPage({
      emoji: parsed.emoji ?? undefined,
      name: parsed.title,
      parentItemId,
      workspaceId,
    });

    pageIdsByPath.set(entry.path, page.id);
    pageIdsByPath.set(stripHtmlExtension(entry.path), page.id);
    createdPageIds.push(page.id);
  }

  const pagePathMap = buildPagePathMap(pageIdsByPath);

  for (const entry of htmlEntries) {
    const pageId = pageIdsByPath.get(entry.path);
    if (!pageId) {
      continue;
    }

    const parsed = normalizeHtml(entry.html, { pagePathMap });
    skippedAssets += parsed.skippedAssets;
    warnings.push(...parsed.warnings);
    await updatePage({ id: pageId, content: parsed.content });
  }

  return {
    createdPageIds,
    entryPageId: createdPageIds[0] ?? null,
    skippedAssets,
    warnings: [...new Set(warnings)],
  };
}

function getParentPagePath(path: string) {
  const parentFolder = path.split("/").slice(0, -1).join("/");

  return parentFolder ? `${parentFolder}.html` : null;
}

function buildPagePathMap(pageIdsByPath: Map<string, string>) {
  const map = new Map<string, string>();

  for (const [path, pageId] of pageIdsByPath.entries()) {
    const normalized = normalizePath(path);
    map.set(normalized, pageId);
    map.set(`./${normalized}`, pageId);
    map.set(normalized.split("/").at(-1) ?? normalized, pageId);
  }

  return map;
}

function stripHtmlExtension(path: string) {
  return path.replace(/\.html$/i, "");
}

function normalizePath(value: string) {
  try {
    return decodeURIComponent(value).replace(/^\.\//, "").replace(/^\/+/, "");
  } catch {
    return value.replace(/^\.\//, "").replace(/^\/+/, "");
  }
}

export function findNotionLinkedPageId(href: string, pagePathMap: Map<string, string> | undefined) {
  if (!pagePathMap) {
    return null;
  }

  const normalizedHref = normalizePath(href);
  const withoutHash = normalizedHref.split("#")[0];

  return (
    pagePathMap.get(normalizedHref) ??
    pagePathMap.get(withoutHash) ??
    Array.from(pagePathMap.entries()).find(([path]) => withoutHash.endsWith(path))?.[1] ??
    null
  );
}
