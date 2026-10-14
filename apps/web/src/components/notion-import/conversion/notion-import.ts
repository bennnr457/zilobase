import { normalizeNotionHtmlBlocks } from "./notion-html-blocks";
import {
  importNotionArchive,
  type ImportNotionPagesInput,
  type ImportNotionZipResult,
} from "@zilobase/features/pages";
export { NotionImportError } from "@zilobase/features/pages";
export type { ImportNotionZipResult } from "@zilobase/features/pages";
export type ImportNotionZipInput = Omit<ImportNotionPagesInput, "entries" | "normalizeHtml"> & {
  file: File;
};

export async function importNotionZipFile({
  file,
  ...input
}: ImportNotionZipInput): Promise<ImportNotionZipResult> {
  return importNotionArchive({
    ...input,
    content: new Uint8Array(await file.arrayBuffer()),
    hasImportableBody,
    normalizeHtml: normalizeNotionHtmlBlocks,
  });
}

function hasImportableBody(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.querySelector(".page-body") ?? doc.body;

  return Boolean(body.textContent?.trim() || body.querySelector("img, video, iframe, table"));
}
