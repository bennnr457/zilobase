import { createHash } from "node:crypto";
import { parsePageDocument, prosemirrorToMarkdown } from "@zilobase/page-context";
import type { PageDocumentNode } from "@zilobase/page-context";
import {
  documentEmbeddingInput,
  SEARCH_PROFILE,
  type PreparedSearchChunk,
  type SearchChunkMetadata,
  type SearchChunkKind,
} from "./vector-contracts";

export const byteLength = (text: string) => new TextEncoder().encode(text).byteLength;

/** Split at code-point boundaries with bounded overlap and monotonic progress. */
export function splitSearchText(
  text: string,
  target: number = SEARCH_PROFILE.chunkTargetBytes,
  overlap: number = SEARCH_PROFILE.chunkOverlapBytes,
) {
  if (target < 8 || overlap < 0 || overlap >= target) throw new Error("SEARCH_CHUNK_LIMIT_INVALID");
  const pieces: Array<{ text: string; start: number; end: number }> = [];
  let start = 0;
  while (start < text.length) {
    let end = start,
      bytes = 0;
    for (const character of text.slice(start)) {
      const size = byteLength(character);
      if (bytes + size > target) break;
      bytes += size;
      end += character.length;
    }
    // Prefer complete lines/words, without discarding their separators.
    if (end < text.length) {
      const prefix = text.slice(start, end);
      const boundary = Math.max(prefix.lastIndexOf("\n"), prefix.lastIndexOf(" "));
      if (boundary > prefix.length / 2) end = start + boundary + 1;
    }
    pieces.push({ text: text.slice(start, end), start, end });
    if (end === text.length) break;
    let next = end,
      retained = 0;
    for (const character of Array.from(text.slice(start, end)).reverse()) {
      retained += byteLength(character);
      if (retained > overlap) break;
      next -= character.length;
    }
    start = Math.max(start + (text.codePointAt(start)! > 0xffff ? 2 : 1), next);
  }
  return pieces;
}

function prefixBytes(text: string, maximum: number) {
  let result = "";
  for (const char of text) {
    if (byteLength(result) + byteLength(char) > maximum) break;
    result += char;
  }
  return result;
}

/** Prevent serialized data URLs and expiring credentials becoming model input. */
export function searchSafeText(text: string) {
  return text
    .replace(/data:[^\s)"']+/gi, "[embedded data]")
    .replace(/https?:\/\/[^\s<>)]*/gi, (raw) => {
      try {
        const url = new URL(raw);
        if (
          [...url.searchParams.keys()].some((key) =>
            /signature|credential|token|x-amz|x-goog|expires/i.test(key),
          )
        )
          return `${url.origin}${url.pathname}`;
        return raw;
      } catch {
        return "[link]";
      }
    });
}

export function prepareSearchChunk(
  title: string,
  markdown: string,
  kind: SearchChunkKind,
  sourceKey: string,
  index: number,
  metadata: SearchChunkMetadata,
): PreparedSearchChunk {
  const safeTitle = prefixBytes(searchSafeText(title).replace(/\s+/g, " "), 512);
  const heading = prefixBytes(metadata.headingPath.join(" / "), 512);
  const input = documentEmbeddingInput(safeTitle, heading ? `${heading}\n\n${markdown}` : markdown);
  if (byteLength(input) > SEARCH_PROFILE.maxInputBytes)
    throw new Error("SEARCH_EMBEDDING_INPUT_TOO_LARGE");
  return {
    kind,
    sourceKey,
    index,
    markdown,
    input,
    inputHash: createHash("sha256")
      .update(SEARCH_PROFILE.id)
      .update("\0")
      .update(input)
      .digest("hex"),
    byteCount: byteLength(input),
    metadata,
  };
}

export function chunkPageMarkdown(title: string, content: unknown): PreparedSearchChunk[] {
  const document = parsePageDocument(content) as PageDocumentNode;
  const result: PreparedSearchChunk[] = [];
  for (const [index, piece] of splitSearchText(searchSafeText(title)).entries()) {
    if (piece.text.trim())
      result.push(
        prepareSearchChunk(title, piece.text, "title", "title", index, { headingPath: [] }),
      );
  }
  const headings: string[] = [];
  let bodyIndex = 0;
  let pending: { markdown: string; metadata: SearchChunkMetadata } | undefined;
  const flush = () => {
    if (pending)
      result.push(
        prepareSearchChunk(title, pending.markdown, "body", "body", bodyIndex++, pending.metadata),
      );
    pending = undefined;
  };
  for (const [blockIndex, node] of (document.type === "doc"
    ? (document.content ?? [])
    : [document]
  ).entries()) {
    const markdown = searchSafeText(prosemirrorToMarkdown(node));
    if (!markdown.trim()) continue;
    if (node.type === "heading") {
      flush();
      const level =
        typeof node.attrs?.level === "number" ? Math.min(6, Math.max(1, node.attrs.level)) : 1;
      headings.length = level - 1;
      headings[level - 1] = markdown.replace(/^#+\s*/, "");
    }
    const code = node.type === "codeBlock";
    if (code) flush();
    const raw = code ? (node.content ?? []).map((child) => child.text ?? "").join("") : markdown;
    const codeTarget =
      Math.max(...[...raw.matchAll(/`+/g)].map(([run]) => run.length), 0) > 50 ? 600 : 2100;
    for (const piece of splitSearchText(raw, code ? codeTarget : 2400)) {
      const text = code
        ? searchSafeText(
            prosemirrorToMarkdown({ ...node, content: [{ type: "text", text: piece.text }] }),
          )
        : piece.text;
      const range = {
        blockIndex,
        start: piece.start,
        end: piece.end,
        ...(typeof node.attrs?.id === "string" ? { blockId: node.attrs.id } : {}),
      };
      if (pending && byteLength(pending.markdown + "\n\n" + text) <= 2400) {
        pending.markdown += "\n\n" + text;
        pending.metadata.blocks!.push(range);
      } else {
        flush();
        pending = {
          markdown: text,
          metadata: { headingPath: headings.filter(Boolean), ...range, blocks: [range] },
        };
      }
      if (code) flush();
    }
  }
  flush();
  return result;
}
