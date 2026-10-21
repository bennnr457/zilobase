import type { ResourceRef } from "@zilobase/page-context";

export type ChatReference = { from: number; to: number; source: ResourceRef };

export const chatReferenceMarker = (source: ResourceRef) =>
  `[[${source.type}:${encodeURIComponent(source.id)}]]`;

/** References in code examples, escaped markers and URL paths remain ordinary text. */
export function chatMarkers(text: string) {
  const matches: { from: number; to: number; type: string; id: string }[] = [];
  const tokens =
    /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)|(`+)|\[\[(page|database|source|record):([^\]\r\n]{1,1152})\]\]|(?<![\w:/[\]%\\])\b(page|database):([A-Za-z0-9_-]+)(?=$|[\s,.;!?)}\]])/gm;
  for (let token = tokens.exec(text); token; token = tokens.exec(text)) {
    const from = token.index;
    if ((text.slice(0, from).match(/\\+$/)?.[0].length ?? 0) % 2) continue;
    if (token[1]) {
      const fence = token[1];
      const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \t]*(?:\n|$)`, "gm");
      closing.lastIndex = tokens.lastIndex;
      const end = closing.exec(text);
      tokens.lastIndex = end ? closing.lastIndex : text.length;
      continue;
    }
    if (token[2]) {
      const ticks = /`+/g;
      let closed = false;
      ticks.lastIndex = tokens.lastIndex;
      for (let end = ticks.exec(text); end; end = ticks.exec(text)) {
        if (end[0] === token[2]) {
          tokens.lastIndex = ticks.lastIndex;
          closed = true;
          break;
        }
      }
      if (!closed) tokens.lastIndex = text.length;
      continue;
    }
    matches.push({
      from,
      to: tokens.lastIndex,
      type: token[3] ?? token[5]!,
      id: token[4] ?? token[6]!,
    });
  }
  return matches;
}

export function chatReferences(text: string): ChatReference[] {
  return chatMarkers(text).flatMap(({ from, to, type, id: encoded }) => {
    if (type !== "page" && type !== "database") return [];
    let id: string;
    try {
      id = decodeURIComponent(encoded);
    } catch {
      return [];
    }
    if (!id || id.length > 128 || /[\s\p{Cc}]/u.test(id)) return [];
    return [{ from, to, source: { type, id } }];
  });
}

export function resolveChatReferences(text: string, legacyRoots: ResourceRef[] = []) {
  const references = chatReferences(text);
  const roots = new Map(legacyRoots.map((source) => [`${source.type}:${source.id}`, source]));
  let normalized = "";
  let position = 0;
  for (const { from, to, source } of references) {
    normalized += text.slice(position, from) + chatReferenceMarker(source);
    position = to;
    roots.set(`${source.type}:${source.id}`, source);
  }
  return { text: normalized + text.slice(position), roots: [...roots.values()] };
}
