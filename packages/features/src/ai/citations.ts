import type { ContextManifestEntry, ResourceRef } from "@zilobase/page-context";

export type ChatMentionPart =
  | { type: "text"; text: string }
  | { type: "source"; source: ResourceRef };

/** Inline markers describe placement; only attached roots can resolve as sources. */
export function chatMentionParts(text: string, roots: ResourceRef[] = []): ChatMentionPart[] {
  const allowed = new Map(roots.map((source) => [`${source.type}:${source.id}`, source]));
  const parts: ChatMentionPart[] = [];
  const used = new Set<string>();
  let position = 0;
  for (const match of text.matchAll(/\[\[(page|database):([^\]\n]{1,1152})\]\]/g)) {
    let id: string;
    try {
      id = decodeURIComponent(match[2]!);
    } catch {
      continue;
    }
    const key = `${match[1]}:${id}`;
    const source = allowed.get(key);
    if (!source) continue;
    if (match.index! > position)
      parts.push({ type: "text", text: text.slice(position, match.index) });
    parts.push({ type: "source", source });
    used.add(key);
    position = match.index! + match[0].length;
  }
  if (position < text.length) parts.push({ type: "text", text: text.slice(position) });
  // Older messages and non-composer actions have roots but no saved placement.
  for (const [key, source] of allowed) {
    if (used.has(key)) continue;
    parts.push({ type: "text", text: " " }, { type: "source", source });
  }
  return parts;
}

export function chatDisplayText(text: string) {
  // Citation identities belong to the source pills, including unresolved ones.
  const content = text.replace(/[ \t]*\[\[(?:page|database|source|record):[^\]\n]+\]\]/g, "");
  // A stream can stop at any character within a marker. Never flash its ID.
  const pending = content.match(/\[\[([^\]\n]*)(?:\])?$/);
  if (!pending) return content.trimEnd();
  const value = pending[1]!;
  const prefixes = ["page:", "database:", "source:", "record:"];
  return prefixes.some((prefix) => prefix.startsWith(value) || value.startsWith(prefix))
    ? content.slice(0, pending.index).trimEnd()
    : content.trimEnd();
}

export function chatCitations(text: string, manifest: ContextManifestEntry[]) {
  const entries = new Map(manifest.map((entry) => [entry.key, entry]));
  const used = new Set<string>();
  return [...text.matchAll(/\[\[([^\]\n]+)\]\]/g)].flatMap((match) => {
    const key = match[1]!;
    const entry = entries.get(key);
    if (!entry || used.has(key)) return [];
    used.add(key);
    return [entry];
  });
}
