export function parsePageDocument(content: unknown): unknown {
  const value: unknown = typeof content === "string" ? JSON.parse(content) : content;
  if (value === null || value === undefined) return { type: "doc", content: [] };
  let nodes = 0;
  const visit = (node: unknown, depth: number) => {
    if (++nodes > 20_000 || depth > 64 || !node || typeof node !== "object" || Array.isArray(node))
      throw new Error("Invalid or oversized page document");
    const record = node as Record<string, unknown>;
    if (
      typeof record.type !== "string" ||
      (record.text !== undefined && typeof record.text !== "string")
    )
      throw new Error("Invalid page node");
    if (
      record.attrs !== undefined &&
      (!record.attrs || typeof record.attrs !== "object" || Array.isArray(record.attrs))
    )
      throw new Error("Invalid page attributes");
    if (
      record.marks !== undefined &&
      (!Array.isArray(record.marks) ||
        record.marks.some(
          (mark) => !mark || typeof mark !== "object" || typeof mark.type !== "string",
        ))
    )
      throw new Error("Invalid page marks");
    if (record.content !== undefined) {
      if (!Array.isArray(record.content)) throw new Error("Invalid page content");
      record.content.forEach((child) => visit(child, depth + 1));
    }
  };
  if (JSON.stringify(value).length > 1_000_000)
    throw new Error("Page document exceeds context limit");
  visit(value, 0);
  return value;
}
