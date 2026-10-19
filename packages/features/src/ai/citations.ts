import type { ContextManifestEntry } from "@zilobase/page-context";

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
