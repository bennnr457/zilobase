export type PageContextLogMeta = {
  primaryId?: string | null;
  attachmentIds?: string[];
  charCount: number;
  buildMs: number;
  trimmedAttachmentIds?: string[];
};

function shouldLogPageContext() {
  if (typeof localStorage === "undefined") {
    return false;
  }

  try {
    return localStorage.getItem("zilobaseDebugAiContext") === "1";
  } catch {
    return false;
  }
}

export function logPageContext(markdown: string, meta: PageContextLogMeta) {
  if (!shouldLogPageContext()) {
    return;
  }

  console.group("[Zilobase AI Context]");
  console.log("meta:", meta);
  try {
    if (localStorage.getItem("zilobaseDebugAiContextContent") === "1")
      console.log(`markdown (${meta.charCount} chars):\n`, markdown);
  } catch {
    /* Storage can be disabled by the browser. */
  }
  console.groupEnd();
}

export function logPageContextRebuild(meta: {
  attachmentCount: number;
  charCount: number;
  buildMs: number;
}) {
  if (!shouldLogPageContext()) {
    return;
  }

  console.log(
    `[Zilobase AI Context] rebuilt (${meta.attachmentCount} attachments, ${meta.charCount} chars, ${meta.buildMs}ms)`,
  );
}

export function logPageContextSent(meta: { charCount: number; attachmentCount: number }) {
  if (!shouldLogPageContext()) {
    return;
  }

  console.log("[Zilobase AI Context] sent with message", meta);
}

export function warnPageContextTrimmed(droppedAttachmentIds: string[]) {
  if (!shouldLogPageContext()) {
    return;
  }

  console.warn("[Zilobase AI Context] trimmed attachments", {
    dropped: droppedAttachmentIds,
  });
}
