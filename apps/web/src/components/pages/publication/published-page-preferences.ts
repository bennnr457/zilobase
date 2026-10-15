import { Effect } from "effect";
import type { EmbeddedItemsOpenAs } from "@zilobase/features/pages";

const PUBLISHED_EMBEDDED_ITEMS_OPEN_AS_KEY = "zilobase:published:embeddedItemsOpenAs";

export { isPublishedFallbackPage } from "@zilobase/features/pages";

export function readPublishedEmbeddedItemsOpenAs(): EmbeddedItemsOpenAs {
  return Effect.runSync(
    Effect.try({
      try: (): EmbeddedItemsOpenAs =>
        typeof window !== "undefined" &&
        window.localStorage.getItem(PUBLISHED_EMBEDDED_ITEMS_OPEN_AS_KEY) === "dialog"
          ? "dialog"
          : "sidepanel",
      catch: (error) => error,
    }).pipe(Effect.orElseSucceed((): EmbeddedItemsOpenAs => "sidepanel")),
  );
}

export function writePublishedEmbeddedItemsOpenAs(mode: EmbeddedItemsOpenAs) {
  Effect.runSync(
    Effect.try({
      try: () => {
        if (typeof window !== "undefined")
          window.localStorage.setItem(PUBLISHED_EMBEDDED_ITEMS_OPEN_AS_KEY, mode);
      },
      catch: (error) => error,
    }).pipe(Effect.ignore),
  );
}
