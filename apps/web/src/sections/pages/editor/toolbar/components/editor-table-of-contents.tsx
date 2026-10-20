import type { Editor as TiptapEditor } from "@tiptap/react";
import type { TableOfContentDataItem } from "@tiptap/extension-table-of-contents";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { CSSProperties } from "react";
import { useDatabaseMetadata } from "@zilobase/features/databases/react";
import { useMeeting } from "@zilobase/features/meetings/react";
import {
  jumpToEditorOutlineItem,
  useEditorOutline,
  type EditorOutlineItem,
} from "../hooks/use-editor-outline";

function DatabaseOutlineTitle({ id }: { id: string | null }) {
  const { data } = useDatabaseMetadata(id, { includeDeleted: true });
  return data?.displayName.trim() || "Database";
}

function MeetingOutlineTitle({ id }: { id: string | null }) {
  const { data } = useMeeting(id);
  return data?.meeting.title.trim() || "Meeting";
}

export function EditorOutlineLink({
  editor,
  item,
  className,
  style,
}: {
  editor: TiptapEditor;
  item: EditorOutlineItem;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <a
      href={`#${item.id}`}
      className={className}
      style={style}
      onMouseDownCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        jumpToEditorOutlineItem(editor, item.id);
      }}
    >
      {item.kind === "database" ? (
        <DatabaseOutlineTitle id={item.resourceId} />
      ) : item.kind === "meeting" ? (
        <MeetingOutlineTitle id={item.resourceId} />
      ) : (
        item.textContent
      )}
    </a>
  );
}

type EditorTableOfContentsProps = {
  editor: TiptapEditor | null;
  items: TableOfContentDataItem[];
};

export function EditorTableOfContents({ editor, items }: EditorTableOfContentsProps) {
  const visibleItems = useEditorOutline(editor).map((item) => ({
    ...item,
    isActive: items.some((heading) => heading.id === item.id && heading.isActive),
  }));
  if (!editor || visibleItems.length === 0) return null;

  return (
    <div className="pointer-events-none sticky top-1/2 z-40 hidden h-0 -translate-y-1/2 md:block">
      <div className="flex justify-end pr-6">
        <HoverCard openDelay={100}>
          <HoverCardTrigger asChild>
            <Button
              aria-label="Table of contents"
              className="pointer-events-auto h-auto min-h-9 w-9 flex-col gap-2 bg-transparent px-1.5 py-2"
              size="icon-lg"
              type="button"
              variant="ghost"
            >
              {visibleItems.slice(0, 7).map((item) => (
                <span
                  aria-hidden="true"
                  className={cn(
                    "block h-0.5 rounded-full bg-indicator-muted",
                    item.originalLevel === 1 && "w-8",
                    item.originalLevel === 2 && "w-6",
                    item.originalLevel === 3 && "w-4",
                    item.originalLevel > 3 && "w-3",
                    item.isActive && "bg-content-primary",
                  )}
                  key={item.id}
                />
              ))}
            </Button>
          </HoverCardTrigger>
          <HoverCardContent align="end" className="w-72 overflow-hidden p-1.5" side="left">
            <nav aria-label="Page headings" className="max-h-[min(28rem,70vh)] overflow-y-auto">
              {visibleItems.map((item) => (
                <EditorOutlineLink
                  editor={editor}
                  item={item}
                  className={cn(
                    "flex h-9 w-full items-center rounded-md px-2 text-left text-sm transition-colors hover:bg-action-neutral-hover focus-visible:bg-action-neutral-hover focus-visible:outline-none",
                    item.level === 2 && "pl-5",
                    item.level >= 3 && "pl-8",
                    item.isActive && "bg-action-neutral-pressed text-action-on-neutral",
                  )}
                  key={item.id}
                />
              ))}
            </nav>
          </HoverCardContent>
        </HoverCard>
      </div>
    </div>
  );
}
