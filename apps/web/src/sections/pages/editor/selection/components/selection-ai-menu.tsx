import { Sparkles } from "@/components/icons";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function SelectionAiMenu() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [prompt, setPrompt] = React.useState("");

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen);
        if (!nextOpen) {
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
          <InputGroup className="has-[[data-slot=input-group-control]:focus-visible]:ring-1">
            <InputGroupInput
              className="h-full"
              autoFocus
              onChange={(event) => setPrompt(event.currentTarget.value)}
              placeholder="Ask AI to rewrite the selection..."
              value={prompt}
            />
          </InputGroup>
        </form>
      </PopoverContent>
    </Popover>
  );
}
