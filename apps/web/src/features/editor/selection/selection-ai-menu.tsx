import { Sparkles } from "@/shared/components/icons";
import * as React from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import type { SelectionAiDiffPreview } from "../core/types";

type SelectionAiMenuProps = {
  editor: unknown;
  onPreviewChange: (preview: SelectionAiDiffPreview | null) => void;
  workspaceId?: string | null;
};

export function SelectionAiMenu({ onPreviewChange }: SelectionAiMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [prompt, setPrompt] = React.useState("");

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen);
        if (!nextOpen) {
          onPreviewChange(null);
          setPrompt("");
        }
      }}
      open={isOpen}
    >
      <PopoverTrigger asChild>
        <Button
          aria-label="Ask AI"
          onMouseDown={(event) => event.preventDefault()}
          size="icon"
          title="Ask AI"
          type="button"
          variant="ghost"
        >
          <Sparkles />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="selection-ai-menu"
        onOpenAutoFocus={(event) => event.preventDefault()}
        side="bottom"
        sideOffset={8}
      >
        <form
          className="selection-ai-form"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <Input
            autoFocus
            onChange={(event) => setPrompt(event.currentTarget.value)}
            placeholder="Ask AI to rewrite the selection..."
            value={prompt}
          />
        </form>
      </PopoverContent>
    </Popover>
  );
}
