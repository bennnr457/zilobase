export function mentionAtCaret(text: string, caret: number) {
  const before = text.slice(0, caret);
  const match = /(?:^|\s)@([^@\n]*)$/.exec(before);
  if (!match || match[1]!.length > 100) return null;
  return { start: caret - match[1]!.length - 1, end: caret, query: match[1]! };
}
