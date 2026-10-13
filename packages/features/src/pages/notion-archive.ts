import { strFromU8, unzipSync } from "fflate";
import {
  importNotionPages,
  NotionImportError,
  type ImportNotionPagesInput,
  type ImportNotionZipResult,
} from "./notion-import";

export type ImportNotionArchiveInput = Omit<ImportNotionPagesInput, "entries"> & {
  content: Uint8Array;
  hasImportableBody: (html: string) => boolean;
};

export async function importNotionArchive({
  createPage,
  content,
  hasImportableBody,
  normalizeHtml,
  updatePage,
  workspaceId,
}: ImportNotionArchiveInput): Promise<ImportNotionZipResult> {
  const entries = readZipEntries(content);
  const markdownFiles = entries.filter((entry) => entry.path.endsWith(".md"));

  if (markdownFiles.length > 0) {
    throw new NotionImportError("Export your Notion pages as HTML, not Markdown.");
  }

  const htmlEntries = entries
    .filter((entry) => entry.path.endsWith(".html") && getFilename(entry.path) !== "index.html")
    .map((entry) => ({
      html: strFromU8(entry.content),
      path: entry.path,
    }))
    .filter((entry) => hasImportableBody(entry.html))
    .sort((first, second) => getDepth(first.path) - getDepth(second.path));

  if (htmlEntries.length === 0) {
    throw new NotionImportError("No Notion HTML pages were found in this zip.");
  }

  return importNotionPages({
    createPage,
    entries: htmlEntries,
    normalizeHtml,
    updatePage,
    workspaceId,
  });
}

function readZipEntries(
  content: Uint8Array,
  prefix = "",
): Array<{ content: Uint8Array; path: string }> {
  const zip = unzipSync(content);
  const entries: Array<{ content: Uint8Array; path: string }> = [];

  for (const [rawPath, entryContent] of Object.entries(zip)) {
    const path = `${prefix}${rawPath}`.replace(/^\/+/, "");

    if (path.startsWith("__MACOSX/") || path.endsWith("/")) {
      continue;
    }

    if (path.endsWith(".zip")) {
      entries.push(...readZipEntries(entryContent, `${stripZipExtension(path)}/`));
      continue;
    }

    entries.push({ content: entryContent, path });
  }

  return entries;
}

function getDepth(path: string) {
  return path.split("/").length;
}

function getFilename(path: string) {
  return path.split("/").at(-1) ?? path;
}

function stripZipExtension(path: string) {
  return path.replace(/\.zip$/i, "");
}
