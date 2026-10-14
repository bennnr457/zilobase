const MAX_TRANSCRIPT_CHUNK_CHARS = 60_000;

export type MeetingSummary = {
  actionItems: Array<{ dueDate: string | null; owner: string | null; task: string }>;
  decisions: string[];
  highlights: string[];
  overview: string;
  title: string;
};

export function buildSummaryDocument(summary: MeetingSummary) {
  const content: Array<Record<string, unknown>> = [
    heading(summary.title, 2),
    paragraph(summary.overview),
  ];
  appendList(content, "Highlights", summary.highlights);
  appendList(content, "Decisions", summary.decisions);
  appendList(
    content,
    "Action items",
    summary.actionItems.map((item) => {
      const metadata = [
        item.owner && `Owner: ${item.owner}`,
        item.dueDate && `Due: ${item.dueDate}`,
      ]
        .filter(Boolean)
        .join(" · ");
      return metadata ? `${item.task} — ${metadata}` : item.task;
    }),
  );
  return { content, type: "doc" };
}

export function splitTranscript(transcript: string) {
  if (transcript.length <= MAX_TRANSCRIPT_CHUNK_CHARS) return [transcript];
  const chunks: string[] = [];
  let remaining = transcript;
  while (remaining.length) {
    let end = Math.min(MAX_TRANSCRIPT_CHUNK_CHARS, remaining.length);
    const newline = remaining.lastIndexOf("\n", end);
    if (newline > MAX_TRANSCRIPT_CHUNK_CHARS / 2) end = newline + 1;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  return chunks;
}

function heading(text: string, level: number) {
  return {
    attrs: { level },
    content: [{ text, type: "text" }],
    type: "heading",
  };
}

function paragraph(text: string) {
  return { content: [{ text, type: "text" }], type: "paragraph" };
}

function appendList(content: Array<Record<string, unknown>>, title: string, items: string[]) {
  if (!items.length) return;
  content.push(heading(title, 3));
  content.push({
    content: items.map((item) => ({ content: [paragraph(item)], type: "listItem" })),
    type: "bulletList",
  });
}
