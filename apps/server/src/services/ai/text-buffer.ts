import type { ProviderChunk } from "./provider";

/** One database write in flight; model consumption continues while small text chunks accumulate. */
export function createChatTextBuffer(
  persist: (chunk: ProviderChunk, complete: boolean) => Promise<void>,
  initial: ProviderChunk = {},
) {
  let text = "";
  let cursor = initial;
  let dirty = false;
  let inFlight: Promise<void> | undefined;
  let inFlightCharacters = 0;
  let savedAt = Date.now();
  const pending = () => ({ ...cursor, text });
  const start = (complete = false): Promise<void> => {
    if (inFlight) return inFlight;
    if (!text && !dirty && !complete) return Promise.resolve();
    const batch = pending();
    inFlightCharacters = text.length;
    text = "";
    dirty = false;
    inFlight = Promise.resolve()
      .then(() => persist(batch, complete))
      .catch((error) => {
        // A cancellation rejection commits neither text nor cursor. Retain it for the stopped transaction.
        if (error instanceof Error && error.message === "CHAT_RUN_CANCELLED")
          text = (batch.text ?? "") + text;
        throw error;
      })
      .finally(() => {
        inFlight = undefined;
        inFlightCharacters = 0;
        savedAt = Date.now();
      });
    return inFlight;
  };
  const drain = async (complete = false) => {
    if (inFlight) await inFlight;
    if (complete) {
      await start(true);
      return;
    }
    // Step checkpoints can overlap delivery of the model's final text chunks.
    while (inFlight || text || dirty) await (inFlight ?? start());
  };
  return {
    get size() {
      return text.length + inFlightCharacters;
    },
    get flushing() {
      return !!inFlight;
    },
    append(chunk: ProviderChunk) {
      if (text.length + inFlightCharacters + (chunk.text?.length ?? 0) > 65_536)
        throw new Error("CHAT_RUN_BATCH_TOO_LARGE");
      text += chunk.text ?? "";
      dirty ||=
        (chunk.responseId != null && chunk.responseId !== cursor.responseId) ||
        (chunk.cursor != null && chunk.cursor !== cursor.cursor) ||
        !!chunk.usage;
      cursor = {
        responseId: chunk.responseId ?? cursor.responseId,
        cursor: chunk.cursor ?? cursor.cursor,
        usage: chunk.usage ?? cursor.usage,
      };
    },
    due() {
      return !inFlight && !!text && Date.now() - savedAt >= 200;
    },
    start,
    drain,
    pending,
    settle: () => inFlight ?? Promise.resolve(),
  };
}
