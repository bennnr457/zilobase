// https://ui.shadcn.com/docs/ai-elements/radix/model-selector
// Mount only when the server advertises available models and accepts a model id.
import { Button } from "@/components/ui/button";
import { ChevronDownIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ModelSelector({
  models,
  value,
  onValueChange,
  disabled,
}: {
  models: readonly { id: string; label: string; provider: string; disabled?: boolean }[];
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Choose model"
          disabled={disabled || !models.length}
        >
          {models.find((model) => model.id === value)?.label ?? "Choose model"}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel>Model</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(id) => {
            if (models.some((model) => model.id === id && !model.disabled)) onValueChange(id);
          }}
        >
          {models.map((model) => (
            <DropdownMenuRadioItem key={model.id} value={model.id} disabled={model.disabled}>
              <span className="truncate">{model.label}</span>
              <span className="ml-2 text-content-secondary">{model.provider}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
