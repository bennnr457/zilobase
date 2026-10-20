// Sources pattern: https://ui.shadcn.com/docs/ai-elements/radix/sources
// Keep sources expanded in the existing chip row, with workspace navigation.
import type { chatCitations } from "@zilobase/features/ai";
import { Trace, TraceLine, TraceTitle } from "@/components/ui/trace";
import { getNavigationItemPath } from "@/app/routing/route-identifiers";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useOpenEmbeddedPage } from "@/sections/pages/navigation/hooks/page-navigation";
import { PageIconDisplay } from "@/sections/pages/appearance/components/page-icon";
import {
  DEFAULT_DATABASE_ITEM_ICON,
  DEFAULT_PAGE_ITEM_ICON,
} from "@/components/navigation/lib/navigation-icons";

export function AnswerSources({
  citations,
  label = "Answer sources",
}: {
  citations: ReturnType<typeof chatCitations>;
  label?: string;
}) {
  const { openPage } = useOpenEmbeddedPage({ contextPageId: null, page: null });
  return (
    <>
      {citations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2" aria-label={label}>
          <Trace className="contents">
            <div className="contents">
              {citations.map((entry) => (
                <Button
                  key={entry.key}
                  asChild
                  size="sm"
                  variant="outline"
                  className="max-w-full justify-start"
                >
                  <Link
                    title={entry.title}
                    to={getNavigationItemPath(
                      entry.pageId
                        ? { pageId: encodeURIComponent(entry.pageId) }
                        : { databaseId: encodeURIComponent(entry.databaseId!) },
                    )}
                    onClick={(event) => {
                      if (
                        !entry.pageId ||
                        event.button !== 0 ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      )
                        return;
                      event.preventDefault();
                      openPage(entry.pageId, { databaseId: entry.databaseId });
                    }}
                  >
                    <TraceLine className="contents text-inherit">
                      <span aria-hidden="true" className="inline-flex shrink-0">
                        <PageIconDisplay
                          size="sm"
                          value={
                            entry.emoji ??
                            (entry.pageId ? DEFAULT_PAGE_ITEM_ICON : DEFAULT_DATABASE_ITEM_ICON)
                          }
                        />
                      </span>
                      <TraceTitle>{entry.title}</TraceTitle>
                    </TraceLine>
                  </Link>
                </Button>
              ))}
            </div>
          </Trace>
        </div>
      )}
    </>
  );
}
