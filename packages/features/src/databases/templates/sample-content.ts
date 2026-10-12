type TextNode = {
  type: "text";
  text: string;
};

type ContentNode = {
  attrs?: Record<string, unknown>;
  content?: Array<ContentNode | TextNode>;
  type: string;
};

function createTextNode(text: string): TextNode {
  return {
    type: "text",
    text,
  };
}

function createParagraphNode(text: string): ContentNode {
  return {
    type: "paragraph",
    ...(text ? { content: [createTextNode(text)] } : {}),
  };
}

function createHeadingNode(text: string, level: number): ContentNode {
  return {
    type: "heading",
    attrs: { level },
    content: [createTextNode(`${getSampleHeadingEmoji(text, level)} ${text}`)],
  };
}

function getSampleHeadingEmoji(text: string, level: number) {
  const normalized = text.toLowerCase();

  if (/checklist|next steps|action items|follow-up|send checklist/.test(normalized)) {
    return "✅";
  }

  if (/risk|blocker|difficult/.test(normalized)) {
    return "⚠️";
  }

  if (/goal|objective|purpose|campaign/.test(normalized)) {
    return "🎯";
  }

  if (/summary|overview|context|status/.test(normalized)) {
    return "📌";
  }

  if (/metric|criteria|proof|success/.test(normalized)) {
    return "📈";
  }

  if (/link|asset|input|channel|stakeholder|contact/.test(normalized)) {
    return "🔗";
  }

  if (/question|open/.test(normalized)) {
    return "❓";
  }

  if (/decision|requirement|scope|non-goal/.test(normalized)) {
    return "🧭";
  }

  if (/note|observation|feedback|research|interview/.test(normalized)) {
    return "📝";
  }

  return level === 1 ? "✨" : "📍";
}

function createListItemNode(text: string): ContentNode {
  return {
    type: "listItem",
    content: [createParagraphNode(text)],
  };
}

function createTaskItemNode(text: string, checked: boolean): ContentNode {
  return {
    type: "taskItem",
    attrs: { checked },
    content: [createParagraphNode(text)],
  };
}

export function createSampleRowContent(markdown: string) {
  const content: ContentNode[] = [];
  const lines = markdown.trim().split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);

    if (heading) {
      content.push(createHeadingNode(heading[2], heading[1].length));
      continue;
    }

    if (line.startsWith("> ")) {
      content.push({
        type: "blockquote",
        content: [createParagraphNode(line.slice(2).trim())],
      });
      continue;
    }

    const task = /^-\s+\[( |x|X)\]\s+(.+)$/.exec(line);

    if (task) {
      const items: ContentNode[] = [];

      while (index < lines.length) {
        const nextTask = /^-\s+\[( |x|X)\]\s+(.+)$/.exec((lines[index] ?? "").trim());

        if (!nextTask) {
          index -= 1;
          break;
        }

        items.push(createTaskItemNode(nextTask[2], nextTask[1].toLowerCase() === "x"));
        index += 1;
      }

      content.push({ type: "taskList", content: items });
      continue;
    }

    if (line.startsWith("- ")) {
      const items: ContentNode[] = [];

      while (index < lines.length) {
        const nextLine = (lines[index] ?? "").trim();

        if (!nextLine.startsWith("- ") || /^-\s+\[( |x|X)\]\s+/.test(nextLine)) {
          index -= 1;
          break;
        }

        items.push(createListItemNode(nextLine.slice(2).trim()));
        index += 1;
      }

      content.push({ type: "bulletList", content: items });
      continue;
    }

    content.push(createParagraphNode(line));
  }

  return {
    type: "doc",
    content,
  };
}
