import { toast } from "sonner";
import type { Editor as TiptapEditor } from "@tiptap/react";
import type { Content } from "@tiptap/core";
import { useCallback, useState } from "react";
import { pasteBookmark } from "../lib/paste";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PasteChoiceState } from "../../lib/editor-types";

type PasteChoiceMenuProps = {
  editor: TiptapEditor | null;
  pasteChoice: PasteChoiceState;
  onClose: () => void;
};

export function PasteChoiceMenu({ editor, pasteChoice, onClose }: PasteChoiceMenuProps) {
  const [pending, setPending] = useState(false);
  const replacePastedUrl = useCallback(
    (content: Content) => {
      const range = pasteChoice.resolve();
      if (!editor || !range) return onClose();
      editor.chain().focus().insertContentAt(range, content).run();
      onClose();
    },
    [editor, onClose, pasteChoice],
  );

  const pasteAsBookmarkOrMention = useCallback(
    async (type: "bookmarkBlock" | "linkMention") => {
      if (pending) return;
      setPending(true);
      try {
        await pasteBookmark(pasteChoice, replacePastedUrl, type);
      } catch {
        toast.error("Could not insert bookmark.");
      } finally {
        onClose();
      }
    },
    [pasteChoice, replacePastedUrl, onClose, pending],
  );

  const pasteAsUrl = useCallback(() => {
    const range = pasteChoice.resolve();
    if (!editor || !range) return onClose();
    editor
      .chain()
      .focus()
      .setTextSelection(range)
      .setLink({ href: pasteChoice.url })
      .setTextSelection(range.to)
      .run();
    onClose();
  }, [editor, onClose, pasteChoice]);

  const pasteChoiceRect = pasteChoice.anchor.getBoundingClientRect();

  return (
    <DropdownMenu modal={false} onOpenChange={(open) => !open && onClose()} open>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="fixed size-px opacity-0"
          style={{ left: pasteChoiceRect.left, top: pasteChoiceRect.bottom }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-48"
        collisionPadding={12}
        onCloseAutoFocus={(event) => event.preventDefault()}
        side="bottom"
        sideOffset={8}
      >
        <DropdownMenuLabel>Paste as</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            void pasteAsBookmarkOrMention("linkMention");
          }}
        >
          Mention
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            void pasteAsBookmarkOrMention("bookmarkBlock");
          }}
        >
          Bookmark
        </DropdownMenuItem>
        {pasteChoice.embedAttrs ? (
          <DropdownMenuItem
            disabled={pending}
            onClick={() => replacePastedUrl({ attrs: pasteChoice.embedAttrs, type: "embedBlock" })}
          >
            Embed
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem disabled={pending} onClick={pasteAsUrl}>
          URL
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
