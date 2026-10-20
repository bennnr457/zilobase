import type { ContextManifestEntry } from "@zilobase/page-context";

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
