import { strFromU8, unzipSync } from "fflate";

import { normalizeNotionHtmlBlocks } from "./notion-html-blocks";

import {
  importNotionPages,
  NotionImportError,
  type ImportNotionPagesInput,
  type ImportNotionZipResult,
} from "@zilobase/features/pages";
export { NotionImportError } from "@zilobase/features/pages";
export type { ImportNotionZipResult } from "@zilobase/features/pages";
export type ImportNotionZipInput = Omit<ImportNotionPagesInput, "entries" | "normalizeHtml"> & {
  file: File;
};

export async function importNotionZipFile({
  createPage,
  file,
  updatePage,
  workspaceId,
}: ImportNotionZipInput): Promise<ImportNotionZipResult> {
  const entries = readZipEntries(new Uint8Array(await file.arrayBuffer()));
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
    normalizeHtml: normalizeNotionHtmlBlocks,
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

function hasImportableBody(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.querySelector(".page-body") ?? doc.body;

  return Boolean(body.textContent?.trim() || body.querySelector("img, video, iframe, table"));
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
