import { ChevronUpIcon, RotateCcwIcon } from "@/components/icons";

import { ButtonGroup, ButtonGroupItem, ButtonGroupSeparator } from "@/components/ui/button-group";
import { cn } from "@/lib/utils";

import { canvasToolOptions } from "../lib/constants";
import type { CanvasTool } from "../lib/types";

export function BottomDock({
  activeTool,
  onSelectTool,
  onReset,
  open,
  toggleOpen,
}: {
  activeTool: CanvasTool | null;
  onSelectTool: (tool: CanvasTool) => void;
  onReset: () => void;
  open: boolean;
  toggleOpen: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto relative flex items-center gap-3">
        {open ? (
          <ButtonGroup
            aria-label="Canvas tools"
            className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2"
            variant="floating"
          >
            {canvasToolOptions.map((option) => {
              const Icon = option.icon;

              return (
                <ButtonGroupItem
                  className={cn(
                    "min-w-24 justify-start",
                    activeTool === option.tool && "bg-action-neutral-hover text-action-on-neutral",
                  )}
                  key={option.tool}
                  onClick={() => onSelectTool(option.tool)}
                  type="button"
                >
                  <Icon className="size-3.5" />
                  {option.label}
                </ButtonGroupItem>
              );
            })}
          </ButtonGroup>
        ) : null}
        <ButtonGroup aria-label="Canvas actions" variant="floating">
          <ButtonGroupItem
            className={cn("px-3", open && "bg-action-neutral-hover text-action-on-neutral")}
            onClick={toggleOpen}
            type="button"
            variant="ghost"
          >
            {activeTool
              ? `${canvasToolOptions.find((option) => option.tool === activeTool)?.label ?? "Item"}`
              : "Items"}
            <ChevronUpIcon
              className={cn("size-4 transition-transform", open ? "rotate-180" : "rotate-0")}
            />
          </ButtonGroupItem>
          <ButtonGroupSeparator />
          <ButtonGroupItem
            aria-label="Reset canvas"
            layout="icon"
            onClick={onReset}
            type="button"
            variant="ghost"
          >
            <RotateCcwIcon className="size-4" />
          </ButtonGroupItem>
        </ButtonGroup>
      </div>
    </div>
  );
}
